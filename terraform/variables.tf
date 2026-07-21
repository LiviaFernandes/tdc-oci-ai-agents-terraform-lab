variable "tenancy_ocid" {
  description = "OCID da tenancy trial. O Resource Manager preenche esta variavel sozinho quando o nome bate exatamente com 'tenancy_ocid'."
  type        = string
}

variable "region" {
  description = "Regiao OCI onde o lab vai rodar. Precisa ter OCI Generative AI disponivel. O Resource Manager preenche esta variavel sozinho quando o nome bate exatamente com 'region', com a regiao escolhida na criacao da conta trial (ex: sa-saopaulo-1)."
  type        = string
  default     = "sa-saopaulo-1"
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

variable "dynamic_group_name" {
  description = "Nome do dynamic group que agrupa a VM do lab. A policy do lab e concedida a este dynamic group."
  type        = string
  default     = "tdc-ai-agents-vm"
}

variable "policy_name" {
  type    = string
  default = "tdc-ai-agents-lab-policy"
}

variable "vcn_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR da subnet publica onde a VM do agente roda."
  type        = string
  default     = "10.0.0.0/24"
}

variable "instance_shape" {
  description = "Shape da VM. VM.Standard.A4.Flex (Ampere) e o padrao. Confira sua quota em Governance & Administration > Limits, Quotas and Usage antes de trocar - tenancies trial variam bastante em quais shapes vem com limite ja alocado; se 'Out of host capacity' ou limite zerado, veja ali qual shape tem OCPUs disponiveis e troque esta variavel."
  type        = string
  default     = "VM.Standard.A4.Flex"
}

variable "instance_ocpus" {
  type    = number
  default = 1
}

variable "instance_memory_in_gbs" {
  description = "Memoria da VM em GB. 8 GB por OCPU e a proporcao padrao do A4.Flex."
  type        = number
  default     = 8
}

variable "app_port" {
  description = "Porta onde o Assistente TDC Floripa fica escutando. E a mesma porta liberada na security list e usada no chat_url."
  type        = number
  default     = 8080
}

variable "ssh_public_key" {
  description = "Sua chave publica SSH, para acessar a VM e ver logs (journalctl -u tdc-agent). Pode deixar vazio se nao precisar de SSH."
  type        = string
  default     = ""
}

variable "model_id" {
  description = "Modelo Cohere usado no OCI Generative AI. cohere.command-r-08-2024 e mais barato; cohere.command-r-plus-08-2024 responde melhor em perguntas mais complexas."
  type        = string
  default     = "cohere.command-r-08-2024"
}

variable "agent_instruction" {
  description = "Instrucoes do agente (system prompt). Substitui o texto padrao."
  type        = string
  default     = <<-EOT
    Voce e o Assistente TDC Floripa, um agente para orientar participantes sobre o TDC Floripa 2026.
    Responda em portugues brasileiro, de forma clara, objetiva e educada.
    Use os documentos de contexto para perguntas gerais sobre o evento, jornadas, formato, FAQ, regras e links oficiais.
    Use obrigatoriamente a tool consulta_programacao_tdc quando a pergunta pedir agenda, programacao, trilhas por dia, horarios, palestras, sessoes, speakers, nomes de pessoas ou busca por termo.
    Nao invente horarios, speakers, valores ou regras que nao estejam no contexto ou na resposta da tool.
  EOT
}

variable "custom_tool_api_url" {
  description = "URL base da API de programacao usada pela Custom Tool. Por padrao usa a API ja publicada do lab original (tdc-oci-ai-agents-lab); troque se voce publicar sua propria copia."
  type        = string
  default     = "https://tdc-oci-ai-agents-lab.onrender.com"
}
