resource "oci_identity_compartment" "lab" {
  compartment_id = var.tenancy_ocid
  name           = var.compartment_name
  description    = var.compartment_description
}

resource "oci_identity_group" "lab_users" {
  compartment_id = var.tenancy_ocid
  name           = var.group_name
  description    = "Grupo do laboratorio TDC AI Agents OCI"
}

resource "oci_identity_user_group_membership" "lab_user" {
  group_id = oci_identity_group.lab_users.id
  user_id  = var.user_ocid
}

# A policy do lab precisa viver no compartment root da tenancy, nao dentro
# do compartment do lab. As statements usam o nome do compartment, nao o OCID.
resource "oci_identity_policy" "lab_policy" {
  compartment_id = var.tenancy_ocid
  name           = var.policy_name
  description    = "Policy do laboratorio TDC AI Agents OCI"

  statements = [
    "Allow group ${oci_identity_group.lab_users.name} to manage object-family in compartment ${oci_identity_compartment.lab.name}",
    "Allow group ${oci_identity_group.lab_users.name} to manage virtual-network-family in compartment ${oci_identity_compartment.lab.name}",
    "Allow group ${oci_identity_group.lab_users.name} to manage generative-ai-family in compartment ${oci_identity_compartment.lab.name}",
    "Allow group ${oci_identity_group.lab_users.name} to manage genai-agent-family in compartment ${oci_identity_compartment.lab.name}",
    "Allow group ${oci_identity_group.lab_users.name} to inspect compartments in tenancy",
  ]
}
