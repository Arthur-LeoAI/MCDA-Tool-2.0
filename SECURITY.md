# Security

## Reporting security issues

Please do not describe security vulnerabilities in public issues. Contact the maintainers via **Security → Report a vulnerability** (private reporting) in the GitHub repository, describing the problem, the steps to reproduce it and its possible impact. We will confirm and address it as soon as possible.

## Data handling

- The API is stateless: uploaded files and submitted data stay in memory only while the request is being processed; **the server does not store them**.
- The logs record only the request method, path, status code, duration and request ID; they **do not record** the content of requests and responses.
- Working data on the browser side is stored in the localStorage of the user's own browser and is not sent to third parties.
- Uploaded files are restricted by type (`.xlsx`, `.xlsm`, `.csv`) and size (5 MB by default).

## Supported versions

Before 1.0, only the latest version on the `main` branch receives security fixes.
