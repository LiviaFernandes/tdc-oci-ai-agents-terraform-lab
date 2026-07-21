# Shapes candidatos, em ordem de preferencia. Tenancies trial variam bastante
# em qual shape ja vem com quota alocada, entao em vez de fixar um shape so,
# consultamos um Compute Capacity Report por Availability Domain e escolhemos
# automaticamente o primeiro da lista que tiver capacidade confirmada. Isso
# evita o erro "Out of host capacity" sem exigir tentativa e erro manual.
locals {
  shape_priority = [
    "VM.Standard.A4.Flex",
    "VM.Standard.A1.Flex",
    "VM.Standard.E4.Flex",
    "VM.Standard.E5.Flex",
  ]
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_shapes" "by_ad" {
  count               = length(data.oci_identity_availability_domains.ads.availability_domains)
  compartment_id      = oci_identity_compartment.lab.id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[count.index].name
}

locals {
  # Por AD, filtra a lista de preferencia para os shapes que a AD realmente oferece.
  ad_supported_shapes = [
    for ad_index, ad in data.oci_identity_availability_domains.ads.availability_domains : [
      for wanted_shape in local.shape_priority : wanted_shape
      if contains([for shape in data.oci_core_shapes.by_ad[ad_index].shapes : shape.name], wanted_shape)
    ]
  ]

  ad_capacity_inputs = [
    for ad_index, ad in data.oci_identity_availability_domains.ads.availability_domains : {
      availability_domain = ad.name
      shapes              = local.ad_supported_shapes[ad_index]
    } if length(local.ad_supported_shapes[ad_index]) > 0
  ]
}

# O compartment_id de um Capacity Report precisa ser sempre o root da tenancy,
# independente de onde a VM vai morar.
resource "oci_core_compute_capacity_report" "by_ad" {
  count               = length(local.ad_capacity_inputs)
  compartment_id      = var.tenancy_ocid
  availability_domain = local.ad_capacity_inputs[count.index].availability_domain

  dynamic "shape_availabilities" {
    for_each = local.ad_capacity_inputs[count.index].shapes

    content {
      instance_shape = shape_availabilities.value

      instance_shape_config {
        ocpus         = var.instance_ocpus
        memory_in_gbs = var.instance_memory_in_gbs
      }
    }
  }
}

locals {
  capacity_pairs = flatten([
    for report in oci_core_compute_capacity_report.by_ad : [
      for shape in report.shape_availabilities : {
        availability_domain = report.availability_domain
        shape_name          = shape.instance_shape
        available_count     = try(tonumber(shape.available_count), 0)
        availability_status = upper(tostring(try(shape.availability_status, "")))
      }
    ]
  ])

  available_capacity_pairs = [
    for pair in local.capacity_pairs : pair
    if pair.available_count > 0 || contains(["AVAILABLE", "SUFFICIENT"], pair.availability_status)
  ]

  # Respeita a ordem de shape_priority: pega o primeiro shape da lista que
  # tiver capacidade confirmada em pelo menos uma AD.
  ranked_pairs = flatten([
    for wanted_shape in local.shape_priority : [
      for pair in local.available_capacity_pairs : pair
      if pair.shape_name == wanted_shape
    ]
  ])

  selected_pair  = local.ranked_pairs[0]
  selected_shape = local.selected_pair.shape_name
  selected_ad    = local.selected_pair.availability_domain
}

data "oci_core_images" "latest_ol" {
  compartment_id           = oci_identity_compartment.lab.id
  operating_system         = "Oracle Linux"
  operating_system_version = "9"
  shape                    = local.selected_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_instance" "vm" {
  compartment_id      = oci_identity_compartment.lab.id
  availability_domain = local.selected_ad
  display_name        = "tdc-ai-agents-vm"
  shape               = local.selected_shape

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_in_gbs
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.latest_ol.images[0].id
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
  }

  metadata = merge(
    {
      user_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
        app_port            = var.app_port
        compartment_id      = oci_identity_compartment.lab.id
        model_id            = var.model_id
        custom_tool_api_url = var.custom_tool_api_url
        server_js_b64       = filebase64("${path.module}/app/server.js")
        package_json_b64    = filebase64("${path.module}/app/package.json")
        rag_documents_b64   = filebase64("${path.module}/app/rag-documents.json")
        index_html_b64      = filebase64("${path.module}/app/public/index.html")
        system_prompt_b64   = base64encode(var.agent_instruction)
      }))
    },
    var.ssh_public_key != "" ? { ssh_authorized_keys = var.ssh_public_key } : {}
  )

  depends_on = [oci_identity_policy.lab_policy]
}
