resource "oci_identity_compartment" "lab" {
  compartment_id = var.tenancy_ocid
  name           = var.compartment_name
  description    = var.compartment_description
}

# Dynamic group: qualquer instancia criada dentro do compartment do lab
# entra automaticamente. E essa identidade que a VM usa (instance
# principal) para chamar o OCI Generative AI, sem precisar de API key.
resource "oci_identity_dynamic_group" "vm" {
  compartment_id = var.tenancy_ocid
  name           = var.dynamic_group_name
  description    = "VMs do laboratorio TDC AI Agents que podem chamar o OCI Generative AI"
  matching_rule  = "ALL {instance.compartment.id = '${oci_identity_compartment.lab.id}'}"
}

# A policy do lab precisa viver no compartment root da tenancy. Estatutos
# minimos pra chamada de chat via instance principal: usar o chat e ler
# metadados do modelo, nada de "manage" no family inteiro.
resource "oci_identity_policy" "lab_policy" {
  compartment_id = var.tenancy_ocid
  name           = var.policy_name
  description    = "Policy do laboratorio TDC AI Agents OCI"

  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.vm.name} to use generative-ai-chat in compartment ${oci_identity_compartment.lab.name}",
    "Allow dynamic-group ${oci_identity_dynamic_group.vm.name} to read generative-ai-model in compartment ${oci_identity_compartment.lab.name}",
  ]
}
