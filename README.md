# Chatbot Worker

This project is a middleware server (as an API) that makes actions on multiple services (GitHub, OpenShift, etc.)

## Requirements

Node 10+ and NPM v6+

## Installation

```bash
npm install
```

## Usage

### Environment variables 

Some variables are mandatory. If not specified, it is optional.
If `OPENSHIFT_TOKEN` variable is provided, [OSEAAS](#oseaas-%28openShift-as-a-service-société-générale%29) part is skipped.

#### GitHub

`GITHUB_URL` **(mandatory)** : Base URL of the GitHub server

`GITHUB_TOKEN` **(mandatory)** : GitHub Token

#### OpenShift

`OPENSHIFT_URL` **(mandatory)** : Base URL of the OpenShift API

`OPENSHIFT_TOKEN`: Token of the account to connect to

`MACHINESET_SUBNET_ID`: Subnet ID for MachineSets

`MACHINESET_AMI_ID`: AMI ID for MachineSets
  
#### OSEAAS (OpenShift as a Service - Société Générale)

`CLUSTER_NAME`: Name of OpenShift cluster

IAMAAS account information :
- `IAMAAS_URL`: Base URL of the IAMAAS service
- `CLIENT_ID`: IAMAAS client ID
- `CLIENT_SECRET`: IAMAAS client secret
- `SCOPE`: IAMAAS client scope

LDAP server info that is linked to OpenShift cluster :
- `LDAP_URL`: URL of LDAP server
- `LDAP_BASE`: LDAP Base
- `LDAP_DN`: LDAP DN
- `LDAP_PASSWORD`: LDAP Password

For GitHub servers that does not have `Import Repository` feature (or disabled feature), use of GitLab server as an intermediate :
- `GITLAB_URL`: URL of GitLab repository
- `GITLAB_TOKEN`: Token of GitLab account
- `PROXY_HOST`: Proxy host needed to connect to GitHub server
- `PROXY_PORT`: Proxy port needed to connect to GitHub server
  
#### General

`PORT`: Port number the server listens to (default to `3000`)

`INSECURE_REQUESTS`: Activate secure requests (default to `false`)

`LOG`: Log level (default to `INFO`)

### Start server

```bash
npm run start
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
