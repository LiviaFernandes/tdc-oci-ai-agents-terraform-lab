variable "tenancy_ocid" {
  description = "OCID da tenancy trial. Em My profile > Tenancy, ou no topo do OCI Console."
  type        = string
}

variable "user_ocid" {
  description = "OCID do usuario que vai entrar no grupo do lab. Normalmente voce mesma, a dona da API key usada para rodar o Terraform. Em My profile > User information."
  type        = string
}

variable "region" {
  description = "Regiao OCI onde o lab vai rodar. Precisa ter OCI Generative AI Agents disponivel, por exemplo us-chicago-1 ou sa-saopaulo-1."
  type        = string
  default     = "us-chicago-1"
}

variable "compartment_name" {
  description = "Nome do compartment criado do zero para o lab."
  type        = string
  default     = "tdc-ai-agents-lab"
}

variable "compartment_description" {
  type    = string
  default = "Recursos do laboratorio TDC AI Agents OCI (Terraform)"
}

variable "group_name" {
  description = "Nome do grupo criado para o lab. A policy do lab e concedida a este grupo."
  type        = string
  default     = "tdc-ai-agents-users"
}

variable "policy_name" {
  type    = string
  default = "tdc-ai-agents-lab-policy"
}

variable "vcn_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "private_subnet_cidr" {
  description = "CIDR da subnet privada usada pela Custom Tool para sair para a internet via NAT Gateway."
  type        = string
  default     = "10.0.1.0/24"
}

variable "bucket_name" {
  description = "Bucket do Object Storage que guarda o PDF usado pela Knowledge Base (RAG)."
  type        = string
  default     = "tdc-agent-kb"
}

variable "agent_display_name" {
  type    = string
  default = "Assistente TDC Floripa"
}

variable "agent_welcome_message" {
  type    = string
  default = "Ola! Sou o Assistente TDC Floripa. Posso responder perguntas sobre o TDC Floripa 2026, trilhas, jornadas, speakers e programacao."
}

variable "agent_instruction" {
  description = "Instrucoes do agente. Substitui o system prompt padrao."
  type        = string
  default     = <<-EOT
    Voce e o Assistente TDC Floripa, um agente para orientar participantes sobre o TDC Floripa 2026.
    Responda em portugues brasileiro, de forma clara, objetiva e educada.
    Use a base de conhecimento para perguntas gerais sobre o evento, jornadas, formato, FAQ, regras e links oficiais.
    Use obrigatoriamente a tool consulta_programacao_tdc quando a pergunta pedir agenda, programacao, trilhas por dia, horarios, palestras, sessoes, speakers, nomes de pessoas ou busca por termo.
    Nao invente horarios, speakers, valores ou regras que nao estejam na base ou na resposta da tool.
  EOT
}

variable "rag_tool_description" {
  type    = string
  default = "Use esta ferramenta somente para perguntas gerais sobre o TDC Floripa 2026, incluindo formato do evento, jornadas, FAQ, inscricoes, modalidades, links oficiais e orientacoes gerais. Nao use esta ferramenta para perguntas sobre agenda, programacao, sessoes, palestras, horarios, trilhas especificas, speakers ou nomes de pessoas; nesses casos use obrigatoriamente a Custom Tool consulta_programacao_tdc."
}

variable "custom_tool_description" {
  type    = string
  default = <<-EOT
    Use esta ferramenta obrigatoriamente para buscar sessoes, speakers, trilhas por dia, horarios, palestras, nomes de pessoas e detalhes estruturados da programacao do TDC Floripa 2026.
    Ela deve ser usada sempre que o usuario perguntar sobre agenda, horarios, palestras, trilhas especificas, speakers, nomes de pessoas ou busca por termo na programacao.
  EOT
}

variable "custom_tool_api_url" {
  description = "URL base da API de programacao usada pela Custom Tool. Por padrao usa a API ja publicada do lab original (tdc-oci-ai-agents-lab); troque se voce publicar sua propria copia."
  type        = string
  default     = "https://tdc-oci-ai-agents-lab.onrender.com"
}
