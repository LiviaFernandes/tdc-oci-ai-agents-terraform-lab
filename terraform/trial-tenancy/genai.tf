resource "oci_generative_ai_agent_knowledge_base" "tdc" {
  compartment_id = oci_identity_compartment.lab.id
  display_name   = "tdc-floripa-2026-kb"
  description    = "Base RAG com a visao geral, FAQ e jornadas do TDC Floripa 2026"

  index_config {
    index_config_type           = "DEFAULT_INDEX_CONFIG"
    should_enable_hybrid_search = true
  }
}

resource "oci_generative_ai_agent_data_source" "tdc" {
  compartment_id    = oci_identity_compartment.lab.id
  knowledge_base_id = oci_generative_ai_agent_knowledge_base.tdc.id
  display_name      = "tdc-floripa-2026-kb-source"
  description       = "Bucket com o PDF da base estatica do TDC Floripa 2026"

  data_source_config {
    data_source_config_type = "OCI_OBJECT_STORAGE"

    object_storage_prefixes {
      bucket    = oci_objectstorage_bucket.kb.name
      namespace = data.oci_objectstorage_namespace.ns.namespace
    }
  }

  depends_on = [oci_objectstorage_object.rag_pdf]
}

resource "oci_generative_ai_agent_data_ingestion_job" "tdc" {
  compartment_id = oci_identity_compartment.lab.id
  data_source_id = oci_generative_ai_agent_data_source.tdc.id
  display_name   = "tdc-floripa-2026-ingestion"
}

resource "oci_generative_ai_agent_agent" "tdc" {
  compartment_id  = oci_identity_compartment.lab.id
  display_name    = var.agent_display_name
  description     = "Agente que responde perguntas sobre o TDC Floripa 2026 usando RAG e uma Custom Tool"
  welcome_message = var.agent_welcome_message

  llm_config {
    routing_llm_customization {
      instruction = var.agent_instruction
    }
  }
}

# RAG Tool: perguntas gerais sobre o evento, respondidas a partir do PDF.
resource "oci_generative_ai_agent_tool" "rag" {
  agent_id       = oci_generative_ai_agent_agent.tdc.id
  compartment_id = oci_identity_compartment.lab.id
  display_name   = "consulta_base_tdc"
  description    = var.rag_tool_description

  tool_config {
    tool_config_type = "RAG_TOOL_CONFIG"

    knowledge_base_configs {
      knowledge_base_id = oci_generative_ai_agent_knowledge_base.tdc.id
    }
  }

  depends_on = [oci_generative_ai_agent_data_ingestion_job.tdc]
}

# Custom Tool: busca estruturada de sessoes, speakers e trilhas via API
# publica. Sem autenticacao, saindo pela subnet privada + NAT Gateway.
resource "oci_generative_ai_agent_tool" "custom" {
  agent_id       = oci_generative_ai_agent_agent.tdc.id
  compartment_id = oci_identity_compartment.lab.id
  display_name   = "consulta_programacao_tdc"
  description    = var.custom_tool_description

  tool_config {
    tool_config_type = "HTTP_ENDPOINT_TOOL_CONFIG"
    subnet_id        = oci_core_subnet.private.id

    api_schema {
      api_schema_input_location_type = "INLINE"
      content = templatefile("${path.module}/../../assets/custom_tool_openapi.yaml.tftpl", {
        api_base_url = var.custom_tool_api_url
      })
    }

    http_endpoint_auth_config {
      http_endpoint_auth_sources {
        http_endpoint_auth_scope = "AGENT"

        http_endpoint_auth_scope_config {
          http_endpoint_auth_scope_config_type = "HTTP_ENDPOINT_NO_AUTH_SCOPE_CONFIG"
        }
      }
    }
  }
}

# Guardrails ficam em Disable para reduzir variaveis durante o lab, igual
# a versao manual. Em producao, avalie usar os guardrails de moderacao,
# PII e prompt injection do endpoint.
resource "oci_generative_ai_agent_agent_endpoint" "tdc" {
  agent_id       = oci_generative_ai_agent_agent.tdc.id
  compartment_id = oci_identity_compartment.lab.id
  display_name   = "tdc-floripa-2026-endpoint"
  description    = "Endpoint do Assistente TDC Floripa"

  should_enable_citation = true
  should_enable_trace    = true
  should_enable_session  = true

  depends_on = [
    oci_generative_ai_agent_tool.rag,
    oci_generative_ai_agent_tool.custom,
  ]
}
