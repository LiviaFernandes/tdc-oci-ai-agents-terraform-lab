output "compartment_id" {
  value = oci_identity_compartment.lab.id
}

output "selected_shape" {
  description = "Shape escolhido automaticamente com base no Compute Capacity Report."
  value       = local.selected_shape
}

output "selected_availability_domain" {
  description = "Availability domain escolhido automaticamente com base no Compute Capacity Report."
  value       = local.selected_ad
}

output "instance_id" {
  value = oci_core_instance.vm.id
}

output "public_ip" {
  value = oci_core_instance.vm.public_ip
}

output "chat_url" {
  value = "http://${oci_core_instance.vm.public_ip}:${var.app_port}"
}

output "ssh_command" {
  value = var.ssh_public_key != "" ? "ssh opc@${oci_core_instance.vm.public_ip}" : "Nenhuma chave SSH configurada (ssh_public_key vazio)."
}
