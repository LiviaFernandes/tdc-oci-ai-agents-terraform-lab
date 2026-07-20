# Rede minima para a Custom Tool: so a subnet privada + NAT Gateway.
# Nao ha VM nem bastion neste lab, entao nao precisamos de subnet publica
# nem de Internet Gateway - o unico trafego e egress HTTPS da Custom Tool.

resource "oci_core_vcn" "lab" {
  compartment_id = oci_identity_compartment.lab.id
  cidr_blocks    = [var.vcn_cidr]
  display_name   = "tdc-ai-agents-vcn"
  dns_label      = "tdcaiagents"
}

resource "oci_core_nat_gateway" "lab" {
  compartment_id = oci_identity_compartment.lab.id
  vcn_id         = oci_core_vcn.lab.id
  display_name   = "tdc-ai-agents-nat"
}

resource "oci_core_route_table" "private" {
  compartment_id = oci_identity_compartment.lab.id
  vcn_id         = oci_core_vcn.lab.id
  display_name   = "tdc-ai-agents-private-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_nat_gateway.lab.id
  }
}

resource "oci_core_security_list" "private" {
  compartment_id = oci_identity_compartment.lab.id
  vcn_id         = oci_core_vcn.lab.id
  display_name   = "tdc-ai-agents-private-sl"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }
}

resource "oci_core_subnet" "private" {
  compartment_id             = oci_identity_compartment.lab.id
  vcn_id                     = oci_core_vcn.lab.id
  cidr_block                 = var.private_subnet_cidr
  display_name               = "tdc-ai-agents-private-subnet"
  dns_label                  = "private"
  prohibit_public_ip_on_vnic = true
  route_table_id             = oci_core_route_table.private.id
  security_list_ids          = [oci_core_security_list.private.id]
}
