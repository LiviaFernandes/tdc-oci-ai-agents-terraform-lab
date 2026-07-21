data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "latest_ol" {
  compartment_id           = oci_identity_compartment.lab.id
  operating_system         = "Oracle Linux"
  operating_system_version = "8"
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_instance" "vm" {
  compartment_id      = oci_identity_compartment.lab.id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "tdc-ai-agents-vm"
  shape               = var.instance_shape

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
        app_port              = var.app_port
        compartment_id        = oci_identity_compartment.lab.id
        model_id              = var.model_id
        custom_tool_api_url   = var.custom_tool_api_url
        server_js_b64         = filebase64("${path.module}/app/server.js")
        package_json_b64      = filebase64("${path.module}/app/package.json")
        rag_documents_b64     = filebase64("${path.module}/app/rag-documents.json")
        index_html_b64        = filebase64("${path.module}/app/public/index.html")
        system_prompt_b64     = base64encode(var.agent_instruction)
      }))
    },
    var.ssh_public_key != "" ? { ssh_authorized_keys = var.ssh_public_key } : {}
  )
}
