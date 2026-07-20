output "compartment_id" {
  value = oci_identity_compartment.lab.id
}

output "group_id" {
  value = oci_identity_group.lab_users.id
}

output "bucket_name" {
  value = oci_objectstorage_bucket.kb.name
}

output "private_subnet_id" {
  value = oci_core_subnet.private.id
}

output "knowledge_base_id" {
  value = oci_generative_ai_agent_knowledge_base.tdc.id
}

output "agent_id" {
  value = oci_generative_ai_agent_agent.tdc.id
}

output "agent_endpoint_id" {
  value = oci_generative_ai_agent_agent_endpoint.tdc.id
}

output "next_step" {
  value = "Abra o OCI Console > Analytics & AI > Generative AI Agents > Agent endpoints, encontre '${oci_generative_ai_agent_agent_endpoint.tdc.display_name}' e clique em Launch chat para testar o agente."
}
