# Rede minima para a VM: subnet publica + Internet Gateway. A VM precisa
# de IP publico para voce abrir o chat_url no navegador, e de egress para
# chamar o OCI Generative AI e a API publica da programacao.

resource "oci_core_vcn" "lab" {
  compartment_id = oci_identity_compartment.lab.id
  cidr_blocks    = [var.vcn_cidr]
  display_name   = "tdc-ai-agents-vcn"
  dns_label      = "tdcaiagents"
}

resource "oci_core_internet_gateway" "lab" {
  compartment_id = oci_identity_compartment.lab.id
  vcn_id         = oci_core_vcn.lab.id
  display_name   = "tdc-ai-agents-igw"
}

resource "oci_core_route_table" "public" {
  compartment_id = oci_identity_compartment.lab.id
  vcn_id         = oci_core_vcn.lab.id
  display_name   = "tdc-ai-agents-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.lab.id
  }
}

resource "oci_core_security_list" "public" {
  compartment_id = oci_identity_compartment.lab.id
  vcn_id         = oci_core_vcn.lab.id
  display_name   = "tdc-ai-agents-public-sl"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "6" # TCP
    tcp_options {
      min = var.app_port
      max = var.app_port
    }
  }

  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "6" # TCP
    tcp_options {
      min = 22
      max = 22
    }
  }
}

resource "oci_core_subnet" "public" {
  compartment_id             = oci_identity_compartment.lab.id
  vcn_id                     = oci_core_vcn.lab.id
  cidr_block                 = var.public_subnet_cidr
  display_name               = "tdc-ai-agents-public-subnet"
  dns_label                  = "public"
  prohibit_public_ip_on_vnic = false
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.public.id]
}
