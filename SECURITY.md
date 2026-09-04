# Security Policy

## Security Overview

The **Stock-Flow** team takes the security of our application, user data, and infrastructure seriously. We appreciate the responsible disclosure of any security vulnerabilities by security researchers, developers, and the broader community.

This document outlines the supported versions of **Stock-Flow**, our security update policy, and instructions on how to report vulnerabilities responsibly.

---

## Supported Versions

We provide security updates and patches exclusively for the latest active release line. When a security vulnerability is identified, patches are applied to the active branch and published in the latest patch release.

| Version Line | Supported          | Status                                 |
| :----------- | :----------------- | :------------------------------------- |
| `1.4.x`      | **Supported**      | Active security patches & bug fixes    |
| `1.3.x`      | **Unsupported**    | End of Life (EOL)                      |
| `1.2.x`      | **Unsupported**    | End of Life (EOL)                      |
| `1.1.x`      | **Unsupported**    | End of Life (EOL)                      |
| `1.0.x`      | **Unsupported**    | End of Life (EOL)                      |
| `< 1.0`      | **Unsupported**    | Initial development releases           |

> **Note:** If you are running an older version (`1.3.x` or earlier), please upgrade to the latest patch release of the `1.4.x` series to receive the latest security fixes and performance updates.

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities via public GitHub issues, discussions, or pull requests.**

### Preferred Method: GitHub Private Vulnerability Reporting

The fastest and most secure way to report a vulnerability in Stock-Flow is through GitHub's Private Vulnerability Reporting feature:

1. Navigate to the repository on GitHub: [https://github.com/EEMEEMMEEx/Stock-Flow](https://github.com/EEMEEMMEEx/Stock-Flow)
2. Click on the **Security** tab.
3. Select **Advisories** under "Reporting".
4. Click **Report a vulnerability** to open a confidential draft advisory directly to the maintainers.

This ensures that the discussion, proof of concept, and patch remain private until a fix is released.

---

## What to Include in a Report

To help us investigate, triage, and resolve the issue quickly, please provide as much relevant information as possible:

1. **Summary & Impact:** A clear description of the vulnerability, including the attack vector and the potential impact (e.g., unauthorized data access, privilege escalation, transaction tampering).
2. **Affected Components:** The affected URL, endpoint, page, API route, or source file (e.g., `/api/r2-upload-url`, `src/pages/Withdrawals.jsx`, RPC function).
3. **Reproducible Steps:** Detailed step-by-step instructions or a safe, non-destructive Proof of Concept (PoC) demonstrating the issue.
4. **Environment & Version:** The specific application version (e.g., `v1.4.58`), browser version, and OS where the issue was reproduced.
5. **Mitigation Suggestion:** Any suggested fix, code modification, or architectural mitigation (optional).

> **Safety Notice:** Do not include sensitive production data, actual API keys, real database credentials, or personally identifiable information (PII) in your report. Use sanitized mock data and test accounts only.

---

## What to Expect (Response Timeline)

When you submit a vulnerability report, the maintainers commit to the following workflow:

| Stage | Expected Timeline | Action |
| :--- | :--- | :--- |
| **Acknowledgement** | Within **48 hours** | We acknowledge receipt of your report and assign a maintainer to investigate. |
| **Triage & Validation** | Within **3–5 business days** | We attempt to reproduce the vulnerability, verify its severity, and determine scope. |
| **Status Updates** | Every **5–7 days** | We keep you informed about progress, remediation plans, and target release dates. |
| **Resolution & Release** | Varies by severity | We develop, test, and release a patch in a new patch version of the `1.4.x` release line. |
| **Public Advisory** | Upon patch deployment | A GitHub Security Advisory will be published. With your permission, we will gladly credit you for the responsible disclosure. |

---

## Responsible Disclosure Guidelines

We ask all security researchers and contributors to follow responsible disclosure principles:

* **Do No Harm:** Do not attempt attacks that could cause denial of service (DoS), disrupt production services, corrupt inventory records, or access data belonging to other users.
* **Test on Personal/Test Accounts:** Limit testing to your own user account or local development instances (`npm run dev`).
* **Maintain Confidentiality:** Keep all details of the vulnerability confidential until a fix has been officially released and deployed.
* **Give Reasonable Time:** Allow the maintenance team reasonable time to investigate and address the vulnerability before sharing details publicly.

---

## Scope & Out-of-Scope Issues

### In Scope
* Authentication bypass and privilege escalation (e.g., unauthorized Role-Based Access Control elevation).
* Database security, Row Level Security (RLS) bypasses, or SQL/RPC injection.
* Insecure Direct Object References (IDOR) affecting inventory, projects, or user accounts.
* Cross-Site Scripting (XSS) or Cross-Site Request Forgery (CSRF).
* Insecure serverless function endpoints or unauthorized object storage manipulation.
* Concurrency flaws or race conditions in atomic inventory deduction.

### Out of Scope
* Volumetric Distributed Denial of Service (DDoS) attacks.
* Spam, phishing, or social engineering targeting team members or users.
* Automated vulnerability scanner outputs without a verified, reproducible proof-of-concept.
* Issues requiring physical access to an unlocked or compromised user device.
* Missing security headers or informational findings that do not lead to demonstrable exploitation.
