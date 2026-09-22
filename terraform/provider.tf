provider "oci" {
  region = var.deployment_region
}

# Compartments, dynamic groups e policies sao recursos de IAM e so podem ser
# criados na home region da tenancy. O Compute pode permanecer em outra regiao.
provider "oci" {
  alias  = "home"
  region = var.home_region
}
