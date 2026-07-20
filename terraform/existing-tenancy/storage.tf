data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.compartment_ocid
}

resource "oci_objectstorage_bucket" "kb" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = var.bucket_name
}

# So um arquivo sobe: a base estatica do evento (visao geral, formato, FAQ,
# jornadas, links oficiais). Programacao e speakers ficam na Custom Tool.
resource "oci_objectstorage_object" "rag_pdf" {
  namespace = data.oci_objectstorage_namespace.ns.namespace
  bucket    = oci_objectstorage_bucket.kb.name
  object    = "base_rag_tdc_floripa_2026.pdf"
  source    = "${path.module}/assets/base_rag_tdc_floripa_2026.pdf"
}
