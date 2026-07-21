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

variable "instance_ocpus" {
  description = "OCPUs da VM. Usado tanto pra checar capacidade disponivel quanto pra criar a VM de fato."
  type        = number
  default     = 1
}

variable "instance_memory_in_gbs" {
  description = "Memoria da VM em GB. 6 GB por OCPU e uma proporcao segura e compativel com os shapes candidatos (A4.Flex, A1.Flex, E4.Flex, E5.Flex)."
  type        = number
  default     = 6
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
  description = "Modelo usado no OCI Generative AI. O catalogo de modelos disponivel varia por regiao - confira em Analytics & AI > Generative AI > Playground quais aparecem para a sua. O app suporta tanto modelos Cohere (cohere.*) quanto os demais (meta.*, xai.*, google.*, openai.*), detectando o formato pelo prefixo do nome."
  type        = string
  default     = "meta.llama-3.3-70b-instruct"
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
