# n8n-nodes-deep-ocr

N8N Community Node for the [Deep-OCR Service](https://deep-ocr.com) — AI-powered OCR for invoices, receipts, contracts, IDs, bank statements and more — returns structured JSON ready to use.

[![npm version](https://badge.fury.io/js/n8n-nodes-deep-ocr.svg)](https://www.npmjs.com/package/n8n-nodes-deep-ocr)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 💡 What it does

You hand it a document, it hands you back clean JSON. No regex, no template matching, no per-vendor parser.

- **Invoices** → vendor, line items, tax breakdown, totals, IBAN, due date
- **Receipts** → merchant, items with per-item tax, payment method
- **Bank statements** → account holder, balances, full transaction list
- **Contracts** → parties, dates, obligations, governing law, signatures
- **IDs / passports** → personal data + MRZ lines
- **Payslips, delivery notes, purchase orders, handwriting** → and more

### Example: invoice PDF → structured JSON

```json
{
  "vendor": { "name": "ACME GmbH", "vat_id": "DE123456789" },
  "invoice_number": "RE-2024-00842",
  "invoice_date": "2024-03-15",
  "due_date": "2024-04-14",
  "line_items": [
    { "description": "Consulting", "quantity": 8, "unit_price": 150.00, "total": 1200.00 }
  ],
  "subtotal": 1200.00,
  "tax_amount": 228.00,
  "total": 1428.00,
  "iban": "DE89 3704 0044 0532 0130 00"
}
```

(Every response also includes `filename`, `document_type`, and a `metadata` object — see [Output Examples](#-output-examples) below for the full shape.)

Drop it into any workflow that needs accounting, expense tracking, KYC, or document classification.

## 🚀 Features

- **Structured Data Extraction**: Receive a structured JSON object with the fields relevant to the document type
- **Document Types & Auto Detection**: Invoice, Receipt, Contract, Delivery Note, Bank Statement, Payslip, Purchase Order, ID Document, Handwriting, Generic, and automatic type detection (`auto`)
- **Multiple Format Support**: PDF, PNG, JPG, JPEG, WebP (up to 10MB)
- **Secure Authentication**: API key stored securely using n8n credentials

## 📦 Installation

### Community Nodes (Recommended)

1. Go to **Settings** → **Community Nodes**
2. Click **Install a community node**
3. Enter `n8n-nodes-deep-ocr`
4. Click **Install**

### Manual Installation

```bash
npm install n8n-nodes-deep-ocr
```

## 🔧 Configuration

### Setting Up Credentials

1. Get your API key from [Deep-OCR Dashboard](https://deep-ocr.com)
2. In n8n, go to **Credentials** → **Add Credential**
3. Search for "Deep-OCR API"
4. Enter your API key and save

## 📖 Usage

1. Add the **Deep-OCR** node to your workflow
2. Connect a node that provides binary data (e.g., Read Binary File, HTTP Request)
3. Configure:
   - **Binary Property**: Name of the binary property containing your document (default: `data`)
   - **Document Type**: Select the type that matches your document
4. Execute — the node outputs a JSON object with the extracted fields

### Document Types

| Type | Description |
|---|---|
| `auto` | Let the API detect the document type automatically |
| `invoice` | Vendor, customer, line items, tax breakdown, totals, IBAN, payment terms |
| `receipt` | Merchant, items, per-item tax rate, tax breakdown, totals, payment method |
| `contract` | Parties (role/name/address), dates, obligations, governing law, signatures |
| `delivery_note` | Sender, recipient, items (ordered vs. delivered), tracking, partial delivery info |
| `bank_statement` | Account holder, IBAN/BIC, opening/closing balance, full transaction list |
| `payslip` | Employer, employee (incl. IBAN), earnings, deductions, gross/net salary |
| `purchase_order` | Buyer, supplier, delivery address, line items, totals |
| `id_document` | Type, document number, personal data, MRZ lines |
| `handwriting` | Full transcription with unclear-word markers, confidence rating, language |
| `generic` | Flexible extraction for any document — adapts structure to the content |

## 📤 Output Examples

### Invoice
```json
{
  "vendor": { "name": "ACME GmbH", "address": "Musterstr. 1, 10115 Berlin", "vat_id": "DE123456789" },
  "invoice_number": "RE-2024-00842",
  "invoice_date": "2024-03-15",
  "due_date": "2024-04-14",
  "line_items": [
    { "description": "Consulting Services", "quantity": 8, "unit_price": 150.00, "total": 1200.00 }
  ],
  "subtotal": 1200.00,
  "tax_rate": 19,
  "tax_amount": 228.00,
  "total": 1428.00,
  "iban": "DE89 3704 0044 0532 0130 00",
  "filename": "invoice.pdf",
  "document_type": "invoice",
  "metadata": { "pages": 1 }
}
```

### Receipt
```json
{
  "merchant": { "name": "REWE City", "address": "Friedrichstr. 12, 10117 Berlin" },
  "date": "2024-03-22",
  "items": [
    { "description": "Bioland Äpfel 1kg", "quantity": 1, "price": 2.49 },
    { "description": "Mineralwasser 6x1.5L", "quantity": 1, "price": 3.99 }
  ],
  "subtotal": 6.48,
  "tax_breakdown": [{ "rate": 7, "amount": 0.42 }],
  "total": 6.90,
  "payment_method": "EC-Karte",
  "filename": "receipt.jpg",
  "document_type": "receipt",
  "metadata": { "pages": 1 }
}
```

## 📋 Example Workflow

```json
{
  "nodes": [
    {
      "name": "Read Invoice PDF",
      "type": "n8n-nodes-base.readBinaryFile",
      "parameters": {
        "filePath": "/path/to/invoice.pdf"
      }
    },
    {
      "name": "Extract Invoice Data",
      "type": "n8n-nodes-deep-ocr.deepOcr",
      "parameters": {
        "binaryPropertyName": "data",
        "documentType": "invoice"
      }
    }
  ]
}
```

## 🔒 Supported File Types

| Format   | MIME Type       | Max Size |
| -------- | --------------- | -------- |
| PDF      | application/pdf | 10MB     |
| PNG      | image/png       | 10MB     |
| JPG/JPEG | image/jpeg      | 10MB     |
| WebP     | image/webp      | 10MB     |

## 🔧 Troubleshooting

### "Unsupported file type" error
The node only accepts PDF, PNG, JPG, JPEG, and WebP files. Make sure the upstream node sets the correct MIME type. If you're using **HTTP Request** to download a file, check that the response has a proper `Content-Type` header.

### "File size exceeds maximum allowed size"
The Deep-OCR API accepts files up to **10MB**. For larger PDFs, consider compressing them first or splitting them into individual pages.

### "Connection tested successfully" but processing fails
Your API key is valid, but the key may not have enough quota remaining. Check your usage in the [Deep-OCR Dashboard](https://deep-ocr.com).

### Node not appearing in n8n's node picker
In n8n 2.x, unverified community nodes are hidden from the picker search. Install the node via **Settings → Community Nodes**, then add it to your workflow by importing the following JSON snippet:

```json
{
  "type": "n8n-nodes-deep-ocr.deepOcr",
  "parameters": { "binaryPropertyName": "data", "documentType": "invoice" }
}
```

### Binary property not found
The **Binary Property** field must match the property name set by the previous node. The default is `data` (used by Read Binary File, HTTP Request, etc.). Check the output of the previous node to confirm the property name.

## 🛠️ Development

### Prerequisites

- Node.js 22+
- pnpm 11+

### Setup

```bash
# Clone the repository
git clone https://github.com/Heey-Global/deep-ocr-n8n.git
cd deep-ocr-n8n

# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Run linter
pnpm lint
```

### Project Structure

```
src/
├── credentials/
│   └── DeepOcrApi.credentials.ts    # API key credential type
├── nodes/
│   └── DeepOcr/
│       ├── DeepOcr.node.ts          # Main node implementation
│       └── deepocr.svg              # Node icon
├── utils/
│   └── errors.ts                    # Error handling utilities
└── index.ts                         # Package entry point
```

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please submit pull requests to our [repository](https://github.com/Heey-Global/deep-ocr-n8n).

## 📞 Support

- [GitHub Issues](https://github.com/Heey-Global/deep-ocr-n8n/issues)
- [Deep-OCR Documentation](https://deep-ocr.com)
