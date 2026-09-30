# Workshop AWS Student Builder Groups

Esse workshop consiste em apresentar conceitos básicos de **Cloud Computing** e fazer um overview sobre os principais conceitos sobre a **AWS**.

Ele consiste na implementação da arquitetura do slide "Arquitetura na prática":

![img](docs/aws_labs.gif)

A página tem um campo de texto para colocar o seu nome e um botão **"Fazer check-in na nuvem"**. Cada check-in grava uma linha na tabela `checkins` do Postgres, e o contador mostra o total. Cada nome só pode fazer check-in uma vez.

## Estrutura

```text
.
├── backend/             # FastAPI + SQLAlchemy (Postgres)
│   ├── app/
│   │   ├── main.py      # rotas e CORS
│   │   ├── db.py        # conexão com o banco
│   │   └── models.py    # tabela checkins
│   ├── Dockerfile
│   ├── docker-compose.yml  # API (dev ou EC2)
│   ├── requirements.txt
│   └── .env.example
├── frontend/            # React + Vite + TypeScript
│   ├── src/
│   └── .env.example
├── scripts/
│   └── install.sh       # user data da EC2: Docker, Compose, Buildx e git
├── docs/                # imagens do README
├── docker-compose.yml   # Postgres local (dev)
└── LICENSE
```

## Requisitos

| Ferramenta | Versão |
| --- | --- |
| [Docker](https://docs.docker.com/get-docker/) + Docker Compose | 24+ |
| [Python](https://www.python.org/downloads/) | 3.12+ |
| [Node.js](https://nodejs.org/) + npm | 20.19+ ou 22.12+ |

## Como rodar o projeto localmente

### 1. Suba o banco (Postgres)

Na raiz do projeto:

```bash
docker compose up -d
```

Isso sobe o Postgres 17 em `localhost:5432` com usuário `sbg_user`, senha `sbg_password` e banco `sbg`. Para conferir se está saudável:

```bash
docker compose ps
```

### 2. Rode o backend (FastAPI)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

A tabela `checkins` é criada automaticamente quando a API sobe. Teste:

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/checkins \
  -H 'Content-Type: application/json' \
  -d '{"name": "Maria"}'
curl http://localhost:8000/checkins/count
```

A documentação fica em <http://localhost:8000/docs>.

#### Alternativa: backend via Docker Compose

Se preferir não instalar o Python, a pasta `backend/` tem um `docker-compose.yml` só da API:

```bash
cd backend
cp .env.example .env
```

No `.env`, troque `localhost` por `host.docker.internal` no `DATABASE_HOST` (de dentro do container, `localhost` é o próprio container) e defina `API_PORT=8000`:

```dotenv
DATABASE_HOST=host.docker.internal
API_PORT=8000
```

Depois:

```bash
docker compose up -d --build
docker compose logs -f api
```

### 3. Rode o frontend (React)

Em outro terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Abra <http://localhost:5173>, digite seu nome e clique no botão.

### 4. Parar tudo

```bash
docker compose down        # para o banco (mantém os dados)
docker compose down -v     # para o banco e apaga os dados
```

## Deploy na AWS

Os passos abaixo usam o Console da AWS na região `us-east-1` e os domínios `api.jvictor.cloud` (backend) e `app.jvictor.cloud` (frontend). Troque pelos seus domínios.

### 1. VPC

A VPC é a rede privada onde a EC2 e o RDS vão rodar. Toda conta já vem com uma **VPC default** em cada região, com subnets públicas e internet gateway configurados.

Como isso é uma apresentação, use a VPC default. Ela serve só para teste: em produção, crie uma VPC própria com subnets privadas para o banco.

### 2. Banco de dados (RDS)

Em **RDS > Create database**:

| Campo | Valor |
| --- | --- |
| Creation method | Standard create |
| Engine | PostgreSQL |
| Engine version | **PostgreSQL 17** (a mesma versão do `docker-compose.yml` local) |
| Templates | Free tier (ou Sandbox) |
| DB instance identifier | `sbg-db` |
| Master username | `sbg_user` |
| Master password | uma senha forte (anote, vai para o `.env`) |
| Instance class | `db.t4g.micro` |
| VPC | VPC default |
| Public access | **No** |
| VPC security group | Create new: `sbg-rds-sg` |
| Initial database name (em *Additional configuration*) | `sbg` |

> **Atenção:** se o *Initial database name* ficar vazio, o RDS não cria o banco `sbg` e a API não sobe.

Depois que o status ficar **Available**, copie o **Endpoint** na aba *Connectivity & security*. Ele é o `DATABASE_HOST`.

### 3. EC2 para o backend

Em **EC2 > Launch instance**:

| Campo | Valor |
| --- | --- |
| Name | `sbg-api` |
| AMI | **Amazon Linux 2023** |
| Instance type | `t3.micro` |
| Key pair | crie ou escolha um par de chaves (para o SSH) |
| VPC / Subnet | VPC default, qualquer subnet pública |
| Auto-assign public IP | Enable |
| Security group | Create security group: `sbg-ec2-sg` |

Regras de entrada do `sbg-ec2-sg`:

| Tipo | Porta | Origem | Para quê |
| --- | --- | --- | --- |
| SSH | 22 | **My IP** | acessar a máquina |
| HTTP | 80 | `0.0.0.0/0` | a API, aberta para todo mundo |

Em **Advanced details > User data**, cole o conteúdo de [`scripts/install.sh`](scripts/install.sh). Ele roda no primeiro boot e instala Docker, Docker Compose, Buildx e git.

Depois de criar a EC2, libere o banco para ela: em **EC2 > Security Groups > `sbg-rds-sg` > Edit inbound rules**, adicione:

| Tipo | Porta | Origem |
| --- | --- | --- |
| PostgreSQL | 5432 | `sbg-ec2-sg` (o security group da EC2) |

Assim só a EC2 conecta no banco, e o RDS continua fechado para a internet.

### 4. Registro DNS da API

Em **Route 53 > Hosted zones > seu domínio > Create record**:

| Campo | Valor |
| --- | --- |
| Record name | `api` |
| Record type | **A** |
| Value | IP público da EC2 |

> O IP público muda se a instância for parada e iniciada de novo. Para algo duradouro, associe um Elastic IP.

### 5. Suba o backend na EC2

Conecte na máquina:

```bash
ssh -i sua-chave.pem ec2-user@api.jvictor.cloud
```

Confira se o user data terminou (o último passo instala o Buildx):

```bash
docker compose version
docker buildx version   # precisa ser 0.17.0 ou maior
```

Se algum comando não existir, espere um pouco e veja o log em `/var/log/cloud-init-output.log`. Se o `docker` der erro de permissão, saia e entre de novo no SSH (o usuário foi adicionado ao grupo `docker` durante o boot).

Clone o projeto e configure as variáveis:

```bash
git clone https://github.com/JvictorMarques/aws-sbg-workshop.git
cd aws-sbg-workshop/backend
cp .env.example .env
vi .env
```

No `.env`, aponte para o RDS e libere o domínio do front no CORS:

```dotenv
DATABASE_HOST=sbg-db.xxxxxxxxxxxx.us-east-1.rds.amazonaws.com
DATABASE_PORT=5432
DATABASE_USER=sbg_user
DATABASE_PASSWORD=a-senha-do-rds
DATABASE_NAME=sbg
CORS_ORIGINS=http://app.jvictor.cloud
API_PORT=80
```

Suba o container:

```bash
docker compose up -d --build
docker compose logs -f api
```

Teste de fora da EC2:

```bash
curl http://api.jvictor.cloud/health
```

### 6. Bucket S3 para o frontend

Em **S3 > Create bucket**:

| Campo | Valor |
| --- | --- |
| Bucket name | **`app.jvictor.cloud`** (igual ao domínio do front) |
| Object Ownership | ACLs disabled |
| Block Public Access | **desmarque** *Block all public access* e confirme |
| Bucket Versioning | **Enable** |

> **Atenção:** para o CNAME do passo 9 funcionar, o nome do bucket precisa ser exatamente o domínio. O S3 usa o cabeçalho `Host` da requisição para achar o bucket.

### 7. Permissão pública de leitura e static hosting

Em **Permissions > Bucket policy**, cole a policy abaixo (troque o nome do bucket). Ela libera só o `s3:GetObject`, ou seja, qualquer pessoa pode ler os arquivos, mas não listar nem alterar:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::app.jvictor.cloud/*"
    }
  ]
}
```

Em **Properties > Static website hosting > Edit**:

| Campo | Valor |
| --- | --- |
| Static website hosting | Enable |
| Index document | `index.html` |

Copie o **Bucket website endpoint** que aparece no fim da seção, algo como `http://app.jvictor.cloud.s3-website-us-east-1.amazonaws.com`.

### 8. Build do frontend e upload

Na sua máquina, aponte o front para a API e gere o build:

```bash
cd frontend
npm install
echo "VITE_API_URL=http://api.jvictor.cloud" > .env
npm run build
```

Envie o **conteúdo** da pasta `dist/` para a raiz do bucket (com a barra no fim de `dist/`):

```bash
aws s3 sync dist/ s3://app.jvictor.cloud/ --delete
```

> Se os arquivos forem parar em `s3://app.jvictor.cloud/dist/...`, o site responde 403/404. O `index.html` precisa estar na raiz do bucket.

### 9. Registro DNS do frontend

Em **Route 53 > Hosted zones > seu domínio > Create record**:

| Campo | Valor |
| --- | --- |
| Record name | `app` |
| Record type | **CNAME** |
| Value | `app.jvictor.cloud.s3-website-us-east-1.amazonaws.com` (o website endpoint, sem `http://`) |

Abra <http://app.jvictor.cloud> e faça o seu check-in.

## Variáveis de ambiente

### Backend (`backend/.env`)

| Variável | Descrição | Exemplo |
| --- | --- | --- |
| `DATABASE_HOST` | Host do Postgres (endpoint do RDS em produção) | `localhost` |
| `DATABASE_PORT` | Porta do Postgres | `5432` |
| `DATABASE_USER` | Usuário do Postgres | `sbg_user` |
| `DATABASE_PASSWORD` | Senha do Postgres | `sbg_password` |
| `DATABASE_NAME` | Nome do banco | `sbg` |
| `CORS_ORIGINS` | Origens liberadas no CORS, separadas por vírgula | `http://app.jvictor.cloud,http://localhost:5173` |
| `CHECKIN_RATE_LIMIT` | Rate limit por IP no `POST /checkins` | `30/minute` |
| `API_PORT` | Porta do host exposta pelo `backend/docker-compose.yml` | `80` (EC2) ou `8000` (dev) |

### Frontend (`frontend/.env`)

| Variável | Descrição | Exemplo |
| --- | --- | --- |
| `VITE_API_URL` | URL pública da API. É embutida no build. | `http://api.jvictor.cloud` |

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/checkins/count` | Total de check-ins |
| `POST` | `/checkins` | Recebe `{ "name": "..." }`, cria um check-in e retorna `{ id, name, created_at, total }` |

Respostas de erro do `POST /checkins`:

| Status | Quando |
| --- | --- |
| `409 Conflict` | O nome já fez check-in |
| `422 Unprocessable Entity` | Nome vazio ou com mais de 100 caracteres |
| `429 Too Many Requests` | Rate limit excedido |

### Rate limit

O `POST /checkins` é limitado por IP com [slowapi](https://github.com/laurentS/slowapi). Acima do limite, a API responde `429 Too Many Requests` e o front avisa o usuário.

- O limite é definido em `CHECKIN_RATE_LIMIT` (padrão `30/minute`). Outros formatos: `5/second`, `100/hour`.

> **Dica:** terminou o workshop? Apague a EC2, o RDS e o bucket para não ter surpresas na fatura.

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE).
