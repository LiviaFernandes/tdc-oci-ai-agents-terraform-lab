# Lab TDC: AI Agents na OCI com Terraform (RAG + Custom Tool)

Suba, via Terraform, um agente de IA generativa na OCI que responde perguntas sobre o TDC Floripa 2026. O agente combina duas fontes de informação: uma base de conhecimento em RAG, alimentada por um PDF com a visão geral do evento, e uma Custom Tool que consulta a programação completa — sessões, trilhas, horários e speakers — em uma API pública já publicada.

Compartment, grupo, policy, rede, bucket, Knowledge Base, agent, tools e endpoint sobem inteiros com um único `terraform apply`, do zero, dentro de uma tenancy trial.

## Demo do lab

O agente responde perguntas como:

```text
Quando acontece o TDC Floripa 2026?
```

```text
Quais trilhas existem no dia 22 de julho?
```

```text
Quais palestras a Livia Rodrigues vai fazer?
```

Perguntas sobre conceitos gerais, jornadas, formato, FAQ e regras usam **RAG**, porque estão no PDF. Perguntas sobre busca estruturada de sessões, speakers, trilhas por dia e filtros usam **Custom Tool**, porque dependem da API de programação.

## Arquitetura

```mermaid
flowchart LR
    User["Você, no Console OCI"]

    subgraph OCI["OCI - sua tenancy"]
        subgraph Agent["Generative AI Agent"]
            Endpoint["Agent Endpoint"]
            RAGTool["RAG Tool"]
            CustomTool["Custom Tool"]
        end
        KB["Knowledge Base"]
        Bucket["Object Storage / PDF"]
        Subnet["Subnet privada"]
        NAT["NAT Gateway"]
    end

    API["API pública da programação"]

    User --> Endpoint
    Endpoint --> RAGTool
    Endpoint --> CustomTool
    RAGTool --> KB
    KB --> Bucket
    CustomTool --> Subnet
    Subnet --> NAT
    NAT -.HTTPS.-> API

    style OCI fill:#f3f4f6,stroke:#111111,stroke-width:2px,stroke-dasharray: 5 5,color:#000000
    style Agent fill:#f3f4f6,stroke:#111111,stroke-width:1px,color:#000000
```

A rede é mínima: apenas subnet privada e NAT Gateway. Não existe subnet pública nem Internet Gateway porque nenhum recurso deste lab precisa de IP público — o único tráfego é o egress HTTPS que a Custom Tool faz para a API de programação.

A Custom Tool usa a API pública já publicada:

```text
https://tdc-oci-ai-agents-lab.onrender.com
```

Para apontar para a sua própria cópia da API, troque a variável `custom_tool_api_url`.

## Pré-requisitos

- Conta OCI Trial ativa.
- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5.
- [OCI CLI](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm) configurado (`oci setup config`), para o provider Terraform usar suas credenciais via `~/.oci/config`.
- Região com OCI Generative AI Agents disponível. Confira a lista atual na [documentação do serviço](https://docs.oracle.com/en-us/iaas/Content/generative-ai-agents/overview.htm).
- Como é uma tenancy trial nova, o dono da conta já é administrator por padrão, então já tem acesso para criar compartment, grupo e policy.

## 1. Preparar as variáveis

Entre na pasta do lab:

```bash
cd terraform/trial-tenancy
```

Copie o arquivo de variáveis:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Preencha `terraform.tfvars` com:

```text
tenancy_ocid = ocid da sua tenancy
user_ocid    = ocid do seu usuário
region       = região com Generative AI Agents disponível
```

Onde encontrar cada valor:

- `tenancy_ocid`: no OCI Console, clique no seu perfil (canto superior direito) e depois em **Tenancy**.
- `user_ocid`: no OCI Console, clique no seu perfil e depois em **User settings**.

## 2. Rodar o Terraform

```bash
terraform init
terraform plan
terraform apply
```

O `apply` cria, nesta ordem:

```text
compartment tdc-ai-agents-lab
grupo tdc-ai-agents-users, com você como membro
policy no root da tenancy
VCN com subnet privada e NAT Gateway
bucket com o PDF da base RAG
Knowledge Base + data source + job de ingestão
o agent
RAG tool
Custom Tool
Agent Endpoint
```

Costuma levar entre 5 e 10 minutos — a maior parte do tempo é a criação da Knowledge Base e do endpoint.

## 3. Conferir os outputs

```bash
terraform output
```

Os outputs trazem os IDs de cada recurso criado e uma dica de onde clicar no Console para abrir o chat.

## 4. Testar no chat

Abra o OCI Console em **Analytics & AI > Generative AI Agents > Agent endpoints**, clique no endpoint criado e depois em **Launch chat**.

### Teste 1: RAG com informação geral do evento

```text
O que são as Jornadas TDC e como elas ajudam uma pessoa a escolher melhor a experiência dela no TDC Floripa 2026?
```

Resultado esperado: resposta conceitual sobre Jornadas TDC e formato do evento. O trace deve mostrar uso da RAG Tool `consulta_base_tdc`.

### Teste 2: Custom Tool com speaker específica

```text
Quais palestras a Livia Rodrigues vai fazer?
```

Resultado esperado: resposta com as sessões da Livia Rodrigues Fernandes Silva. O trace deve mostrar chamada a `consulta_programacao_tdc`.

### Teste 3: RAG + Custom Tool na mesma resposta

```text
Estou interessado em GenAI e agentes. Explique rapidamente como o TDC organiza trilhas ou jornadas e depois liste sessões da programação que falem sobre agentes.
```

Resultado esperado: a primeira parte vem da RAG, a segunda vem da Custom Tool, listando sessões filtradas por `agentes` ou termos relacionados.

### Teste 4: roteiro personalizado

```text
Tenho acesso ao dia 24/jul e me interesso por GenAI, LLMs e avaliação de modelos. Monte um roteiro objetivo para mim com as sessões mais relevantes, horários e trilha.
```

Resultado esperado: o agente usa a Custom Tool para buscar sessões do dia 24/jul relacionadas a GenAI/LLMs e monta um roteiro em ordem de horário.

## Variáveis principais

As variáveis com valor padrão (nomes de recursos, mensagens do agente, descrição das tools) estão em `terraform/trial-tenancy/variables.tf` e podem ser sobrescritas no `terraform.tfvars`. As mais importantes:

| Variável | Descrição |
| --- | --- |
| `tenancy_ocid`, `user_ocid` | Identificam a tenancy e o usuário que entra no grupo do lab. |
| `region` | Região OCI com Generative AI Agents disponível. |
| `custom_tool_api_url` | URL base da API de programação usada pela Custom Tool. |
| `agent_instruction` | System prompt do agente. |

## Custo, sem complicar

| Parte | Como pensar |
| --- | --- |
| Rede | VCN, subnet privada, NAT Gateway e security list não cobram por existir; tráfego de saída pode seguir as regras de cobrança da OCI. |
| Object Storage | O PDF da base RAG é pequeno; fica dentro do free tier na maioria das tenancies. |
| Generative AI Agents | Knowledge Base, agent e tools cobram por uso (consultas, ingestão, tokens do LLM por trás do RAG e das respostas). Usou pouco no lab, paga pouco. |

Para não deixar recursos ligados sem necessidade, destrua o lab quando terminar:

```bash
terraform destroy
```

## Rodando via Resource Manager

Se preferir não instalar Terraform localmente, dê um zip na pasta `terraform/trial-tenancy` e suba como Stack:

1. Abra o OCI Console.
2. Vá em **Developer Services > Resource Manager > Stacks**.
3. Clique em **Create Stack**, escolha upload de `.zip`.
4. Envie o zip, selecione o compartment e dê um nome para a stack.
5. Marque **Run apply** na criação, ou rode um Apply depois.
6. Ao terminar, confira os outputs na aba de outputs da stack.
