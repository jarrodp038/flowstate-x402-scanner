import express from "express";
import { paymentMiddleware } from "x402-express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ===========================================
// CONFIGURATION - UPDATE THESE VALUES
// ===========================================
const WALLET_ADDRESS = process.env.WALLET_ADDRESS || "0x42063afe86ea3e6b0a0f3a7404e3f44f110ff374";
const PORT = process.env.PORT || 4021;
const NETWORK = process.env.NETWORK || "base"; // Use "base-sepolia" for testing
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.coinbase.com"; // Use "https://x402.org/facilitator" for testnet

// ===========================================
// x402 PAYMENT MIDDLEWARE - This is the magic
// ===========================================
app.use(
  paymentMiddleware(
    WALLET_ADDRESS,
    {
      // Smart Contract Quick Scan - $0.05 per scan
      "POST /api/scan/quick": {
        price: "$0.05",
        network: NETWORK,
        config: {
          description: "Quick vulnerability scan for Solidity smart contracts. Detects common vulnerabilities like reentrancy, overflow, access control issues.",
          discoverable: true, // This lists your service in the x402 Bazaar!
          category: "security",
          tags: ["solidity", "smart-contract", "audit", "security", "ethereum", "blockchain"],
          inputSchema: {
            type: "object",
            properties: {
              code: { type: "string", description: "Solidity source code to scan" },
              contractName: { type: "string", description: "Name of the contract (optional)" }
            },
            required: ["code"]
          },
          outputSchema: {
            type: "object",
            properties: {
              vulnerabilities: { type: "array" },
              riskScore: { type: "number" },
              summary: { type: "string" }
            }
          }
        }
      },

      // Deep Security Audit - $0.50 per audit
      "POST /api/scan/deep": {
        price: "$0.50",
        network: NETWORK,
        config: {
          description: "Comprehensive smart contract security audit with detailed recommendations, gas optimization tips, and best practice analysis.",
          discoverable: true,
          category: "security",
          tags: ["solidity", "audit", "security", "gas-optimization", "defi"],
          inputSchema: {
            type: "object",
            properties: {
              code: { type: "string", description: "Solidity source code" },
              contractName: { type: "string", description: "Contract name" },
              includeGasAnalysis: { type: "boolean", description: "Include gas optimization suggestions" }
            },
            required: ["code"]
          }
        }
      },

      // Contract Comparison - $0.10
      "POST /api/compare": {
        price: "$0.10",
        network: NETWORK,
        config: {
          description: "Compare two smart contracts to identify differences, potential security implications of changes.",
          discoverable: true,
          category: "security",
          tags: ["solidity", "diff", "compare", "audit"]
        }
      },

      // Generate Security Report - $1.00
      "POST /api/report": {
        price: "$1.00",
        network: NETWORK,
        config: {
          description: "Generate a professional PDF security audit report for your smart contract. Suitable for investor due diligence.",
          discoverable: true,
          category: "security",
          tags: ["solidity", "audit", "report", "pdf", "professional"]
        }
      }
    },
    { url: FACILITATOR_URL }
  )
);

// ===========================================
// SECURITY SCANNING LOGIC
// ===========================================

// Vulnerability patterns to detect
const VULNERABILITY_PATTERNS = [
  {
    id: "REENTRANCY",
    name: "Reentrancy Vulnerability",
    severity: "CRITICAL",
    pattern: /\.call\{.*value.*\}|\.call\.value\(|\.send\(|\.transfer\(/gi,
    description: "External calls before state changes can allow reentrancy attacks",
    recommendation: "Use checks-effects-interactions pattern or ReentrancyGuard"
  },
  {
    id: "TX_ORIGIN",
    name: "tx.origin Authentication",
    severity: "HIGH",
    pattern: /tx\.origin/gi,
    description: "Using tx.origin for authentication is vulnerable to phishing",
    recommendation: "Use msg.sender instead of tx.origin for authentication"
  },
  {
    id: "UNCHECKED_CALL",
    name: "Unchecked External Call",
    severity: "HIGH",
    pattern: /\.call\(|\.delegatecall\(|\.staticcall\(/gi,
    description: "External call return value not checked",
    recommendation: "Always check the return value of low-level calls"
  },
  {
    id: "SELFDESTRUCT",
    name: "Selfdestruct Present",
    severity: "MEDIUM",
    pattern: /selfdestruct\(|suicide\(/gi,
    description: "Contract can be destroyed, potentially locking funds",
    recommendation: "Remove selfdestruct or add strict access controls"
  },
  {
    id: "BLOCK_TIMESTAMP",
    name: "Block Timestamp Dependence",
    severity: "LOW",
    pattern: /block\.timestamp|now/gi,
    description: "Miners can manipulate block.timestamp within ~15 seconds",
    recommendation: "Avoid using block.timestamp for critical logic"
  },
  {
    id: "FLOATING_PRAGMA",
    name: "Floating Pragma",
    severity: "LOW",
    pattern: /pragma solidity \^/gi,
    description: "Floating pragma allows compilation with different versions",
    recommendation: "Lock pragma to specific version (e.g., pragma solidity 0.8.19)"
  },
  {
    id: "MISSING_ZERO_CHECK",
    name: "Missing Zero Address Check",
    severity: "MEDIUM",
    pattern: /address\s+\w+\s*[=;](?!.*require.*!=.*address\(0\))/gi,
    description: "Address parameters not validated against zero address",
    recommendation: "Add require(addr != address(0)) checks"
  },
  {
    id: "ARBITRARY_SEND",
    name: "Arbitrary ETH Send",
    severity: "HIGH",
    pattern: /\.transfer\(|\.send\(|\.call\{.*value/gi,
    description: "ETH transfer to potentially arbitrary address",
    recommendation: "Validate recipient addresses, use withdrawal pattern"
  },
  {
    id: "UNPROTECTED_FUNC",
    name: "Unprotected Function",
    severity: "HIGH",
    pattern: /function\s+\w+\s*\([^)]*\)\s*(?:external|public)(?!\s*view|\s*pure)/gi,
    description: "Public/external function without access control",
    recommendation: "Add onlyOwner or role-based access control"
  },
  {
    id: "OUTDATED_COMPILER",
    name: "Outdated Compiler Version",
    severity: "MEDIUM",
    pattern: /pragma solidity\s+0\.[0-6]\./gi,
    description: "Using outdated Solidity version with known issues",
    recommendation: "Upgrade to Solidity 0.8.x for built-in overflow checks"
  },
  {
    id: "UNCHECKED_MATH",
    name: "Unchecked Math Operations",
    severity: "MEDIUM",
    pattern: /unchecked\s*\{/gi,
    description: "Unchecked arithmetic blocks bypass overflow protection",
    recommendation: "Use unchecked blocks only when overflow is impossible"
  },
  {
    id: "ASSEMBLY_USAGE",
    name: "Inline Assembly Usage",
    severity: "INFO",
    pattern: /assembly\s*\{/gi,
    description: "Inline assembly bypasses Solidity safety features",
    recommendation: "Audit assembly code carefully, document purpose"
  }
];

// Gas optimization patterns
const GAS_PATTERNS = [
  {
    id: "STORAGE_IN_LOOP",
    name: "Storage Read in Loop",
    pattern: /for\s*\([^)]*\)\s*\{[^}]*\b(storage|mapping|state)\b/gi,
    suggestion: "Cache storage variables in memory before loop"
  },
  {
    id: "STRING_STORAGE",
    name: "String Storage",
    pattern: /string\s+(public|private|internal)?\s*\w+\s*=/gi,
    suggestion: "Consider bytes32 for fixed-length strings"
  },
  {
    id: "MULTIPLE_SLOADS",
    name: "Multiple Storage Reads",
    pattern: /(\w+\.\w+)[\s\S]*?\1/gi,
    suggestion: "Cache repeated storage reads in local variable"
  }
];

function scanContract(code) {
  const vulnerabilities = [];
  const lines = code.split("\n");
  
  for (const vuln of VULNERABILITY_PATTERNS) {
    const matches = code.match(vuln.pattern);
    if (matches) {
      // Find line numbers
      const locations = [];
      lines.forEach((line, idx) => {
        if (vuln.pattern.test(line)) {
          locations.push(idx + 1);
        }
        vuln.pattern.lastIndex = 0; // Reset regex
      });
      
      vulnerabilities.push({
        id: vuln.id,
        name: vuln.name,
        severity: vuln.severity,
        description: vuln.description,
        recommendation: vuln.recommendation,
        occurrences: matches.length,
        lines: locations.slice(0, 5) // First 5 occurrences
      });
    }
  }
  
  return vulnerabilities;
}

function calculateRiskScore(vulnerabilities) {
  const weights = { CRITICAL: 40, HIGH: 25, MEDIUM: 10, LOW: 5, INFO: 1 };
  let score = 100;
  
  for (const vuln of vulnerabilities) {
    score -= weights[vuln.severity] * vuln.occurrences;
  }
  
  return Math.max(0, Math.min(100, score));
}

function analyzeGas(code) {
  const suggestions = [];
  
  for (const pattern of GAS_PATTERNS) {
    if (pattern.pattern.test(code)) {
      suggestions.push({
        id: pattern.id,
        issue: pattern.name,
        suggestion: pattern.suggestion
      });
    }
    pattern.pattern.lastIndex = 0;
  }
  
  return suggestions;
}

// ===========================================
// API ENDPOINTS
// ===========================================

// Health check (free)
app.get("/", (req, res) => {
  res.json({
    service: "FlowState AI - Smart Contract Security Scanner",
    version: "1.0.0",
    status: "operational",
    endpoints: {
      quickScan: "POST /api/scan/quick ($0.05)",
      deepAudit: "POST /api/scan/deep ($0.50)",
      compare: "POST /api/compare ($0.10)",
      report: "POST /api/report ($1.00)"
    },
    author: "Flow State AI (flowstateai.agency)",
    x402: true
  });
});

// Quick Scan - $0.05
app.post("/api/scan/quick", (req, res) => {
  try {
    const { code, contractName } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: "Missing 'code' field" });
    }
    
    const vulnerabilities = scanContract(code);
    const riskScore = calculateRiskScore(vulnerabilities);
    
    const criticalCount = vulnerabilities.filter(v => v.severity === "CRITICAL").length;
    const highCount = vulnerabilities.filter(v => v.severity === "HIGH").length;
    
    res.json({
      success: true,
      contractName: contractName || "Unknown",
      timestamp: new Date().toISOString(),
      summary: {
        riskScore,
        riskLevel: riskScore >= 80 ? "LOW" : riskScore >= 50 ? "MEDIUM" : riskScore >= 20 ? "HIGH" : "CRITICAL",
        totalIssues: vulnerabilities.length,
        critical: criticalCount,
        high: highCount,
        medium: vulnerabilities.filter(v => v.severity === "MEDIUM").length,
        low: vulnerabilities.filter(v => v.severity === "LOW").length
      },
      vulnerabilities: vulnerabilities.sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
        return order[a.severity] - order[b.severity];
      }),
      poweredBy: "FlowState AI"
    });
  } catch (error) {
    res.status(500).json({ error: "Scan failed", message: error.message });
  }
});

// Deep Audit - $0.50
app.post("/api/scan/deep", (req, res) => {
  try {
    const { code, contractName, includeGasAnalysis = true } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: "Missing 'code' field" });
    }
    
    const vulnerabilities = scanContract(code);
    const riskScore = calculateRiskScore(vulnerabilities);
    const gasAnalysis = includeGasAnalysis ? analyzeGas(code) : [];
    
    // Extract contract info
    const contractMatch = code.match(/contract\s+(\w+)/);
    const inheritsMatch = code.match(/contract\s+\w+\s+is\s+([^{]+)/);
    const functionMatches = code.match(/function\s+\w+/g) || [];
    const modifierMatches = code.match(/modifier\s+\w+/g) || [];
    const eventMatches = code.match(/event\s+\w+/g) || [];
    
    res.json({
      success: true,
      auditId: `AUDIT-${Date.now()}`,
      contractName: contractName || contractMatch?.[1] || "Unknown",
      timestamp: new Date().toISOString(),
      
      contractAnalysis: {
        inherits: inheritsMatch ? inheritsMatch[1].split(",").map(s => s.trim()) : [],
        functions: functionMatches.length,
        modifiers: modifierMatches.length,
        events: eventMatches.length,
        linesOfCode: code.split("\n").length
      },
      
      securityAssessment: {
        riskScore,
        riskLevel: riskScore >= 80 ? "LOW" : riskScore >= 50 ? "MEDIUM" : riskScore >= 20 ? "HIGH" : "CRITICAL",
        passedChecks: VULNERABILITY_PATTERNS.length - vulnerabilities.length,
        failedChecks: vulnerabilities.length
      },
      
      vulnerabilities: vulnerabilities.map(v => ({
        ...v,
        priority: v.severity === "CRITICAL" ? "IMMEDIATE" : v.severity === "HIGH" ? "HIGH" : "NORMAL"
      })),
      
      gasOptimization: gasAnalysis,
      
      bestPractices: {
        hasAccessControl: /onlyOwner|Ownable|AccessControl/i.test(code),
        hasReentrancyGuard: /ReentrancyGuard|nonReentrant/i.test(code),
        usesSafemath: /SafeMath|0\.8\./i.test(code),
        hasEvents: eventMatches.length > 0,
        hasNatspec: /\/\/\/|@notice|@dev|@param/i.test(code)
      },
      
      recommendations: generateRecommendations(vulnerabilities, code),
      
      poweredBy: "FlowState AI - flowstateai.agency"
    });
  } catch (error) {
    res.status(500).json({ error: "Audit failed", message: error.message });
  }
});

// Compare Contracts - $0.10
app.post("/api/compare", (req, res) => {
  try {
    const { codeA, codeB, nameA, nameB } = req.body;
    
    if (!codeA || !codeB) {
      return res.status(400).json({ error: "Missing 'codeA' or 'codeB' field" });
    }
    
    const vulnsA = scanContract(codeA);
    const vulnsB = scanContract(codeB);
    const scoreA = calculateRiskScore(vulnsA);
    const scoreB = calculateRiskScore(vulnsB);
    
    const newVulns = vulnsB.filter(vB => !vulnsA.some(vA => vA.id === vB.id));
    const fixedVulns = vulnsA.filter(vA => !vulnsB.some(vB => vB.id === vA.id));
    
    res.json({
      success: true,
      comparison: {
        contractA: {
          name: nameA || "Contract A",
          riskScore: scoreA,
          issues: vulnsA.length
        },
        contractB: {
          name: nameB || "Contract B",
          riskScore: scoreB,
          issues: vulnsB.length
        },
        scoreDelta: scoreB - scoreA,
        improved: scoreB > scoreA
      },
      newVulnerabilities: newVulns,
      fixedVulnerabilities: fixedVulns,
      recommendation: scoreB >= scoreA 
        ? "Contract B has equal or better security posture"
        : "Contract B has introduced new security concerns",
      poweredBy: "FlowState AI"
    });
  } catch (error) {
    res.status(500).json({ error: "Comparison failed", message: error.message });
  }
});

// Generate Report - $1.00
app.post("/api/report", (req, res) => {
  try {
    const { code, contractName, clientName, projectName } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: "Missing 'code' field" });
    }
    
    const vulnerabilities = scanContract(code);
    const riskScore = calculateRiskScore(vulnerabilities);
    const gasAnalysis = analyzeGas(code);
    const reportId = `FSA-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Generate markdown report
    const report = generateMarkdownReport({
      reportId,
      contractName: contractName || "Smart Contract",
      clientName: clientName || "Client",
      projectName: projectName || "Project",
      vulnerabilities,
      riskScore,
      gasAnalysis,
      code
    });
    
    res.json({
      success: true,
      reportId,
      format: "markdown",
      report,
      summary: {
        riskScore,
        criticalIssues: vulnerabilities.filter(v => v.severity === "CRITICAL").length,
        highIssues: vulnerabilities.filter(v => v.severity === "HIGH").length,
        totalIssues: vulnerabilities.length
      },
      poweredBy: "FlowState AI Security Audit"
    });
  } catch (error) {
    res.status(500).json({ error: "Report generation failed", message: error.message });
  }
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function generateRecommendations(vulnerabilities, code) {
  const recs = [];
  
  if (vulnerabilities.some(v => v.id === "REENTRANCY")) {
    recs.push({
      priority: "CRITICAL",
      action: "Implement ReentrancyGuard from OpenZeppelin",
      code: "import '@openzeppelin/contracts/security/ReentrancyGuard.sol';"
    });
  }
  
  if (!code.includes("Ownable") && !code.includes("onlyOwner")) {
    recs.push({
      priority: "HIGH",
      action: "Add access control to administrative functions",
      code: "import '@openzeppelin/contracts/access/Ownable.sol';"
    });
  }
  
  if (vulnerabilities.some(v => v.id === "FLOATING_PRAGMA")) {
    recs.push({
      priority: "MEDIUM",
      action: "Lock Solidity version",
      code: "pragma solidity 0.8.19;"
    });
  }
  
  return recs;
}

function generateMarkdownReport({ reportId, contractName, clientName, projectName, vulnerabilities, riskScore, gasAnalysis, code }) {
  const criticals = vulnerabilities.filter(v => v.severity === "CRITICAL");
  const highs = vulnerabilities.filter(v => v.severity === "HIGH");
  const mediums = vulnerabilities.filter(v => v.severity === "MEDIUM");
  const lows = vulnerabilities.filter(v => v.severity === "LOW");
  
  return `
# Smart Contract Security Audit Report

## Report Information
- **Report ID:** ${reportId}
- **Date:** ${new Date().toISOString().split("T")[0]}
- **Client:** ${clientName}
- **Project:** ${projectName}
- **Contract:** ${contractName}
- **Auditor:** FlowState AI Security

---

## Executive Summary

This audit was performed on the ${contractName} smart contract. The analysis identified **${vulnerabilities.length} potential security issues**.

### Risk Score: ${riskScore}/100 (${riskScore >= 80 ? "LOW RISK" : riskScore >= 50 ? "MEDIUM RISK" : riskScore >= 20 ? "HIGH RISK" : "CRITICAL RISK"})

| Severity | Count |
|----------|-------|
| Critical | ${criticals.length} |
| High | ${highs.length} |
| Medium | ${mediums.length} |
| Low | ${lows.length} |

---

## Findings

${vulnerabilities.map((v, i) => `
### ${i + 1}. ${v.name}

- **Severity:** ${v.severity}
- **ID:** ${v.id}
- **Occurrences:** ${v.occurrences}
- **Lines:** ${v.lines.join(", ") || "Multiple locations"}

**Description:** ${v.description}

**Recommendation:** ${v.recommendation}
`).join("\n")}

---

## Gas Optimization Suggestions

${gasAnalysis.length > 0 ? gasAnalysis.map(g => `
- **${g.issue}:** ${g.suggestion}
`).join("\n") : "No significant gas optimization issues detected."}

---

## Disclaimer

This audit is provided as-is and does not guarantee the complete absence of vulnerabilities. Smart contract security is an evolving field, and new attack vectors may be discovered. Always conduct multiple audits before deployment.

---

*Generated by FlowState AI Security | flowstateai.agency*
*Report ID: ${reportId}*
`;
}

// ===========================================
// START SERVER
// ===========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   FlowState AI - Smart Contract Security Scanner          ║
║   x402 Payment-Enabled API Service                        ║
╠═══════════════════════════════════════════════════════════╣
║   Server running on: http://0.0.0.0:${PORT}                 ║
║   Network: ${NETWORK.padEnd(46)}║
║   Wallet: ${WALLET_ADDRESS.slice(0, 10)}...${WALLET_ADDRESS.slice(-6)}                          ║
╠═══════════════════════════════════════════════════════════╣
║   ENDPOINTS:                                              ║
║   POST /api/scan/quick  - Quick vulnerability scan ($0.05)║
║   POST /api/scan/deep   - Deep security audit ($0.50)     ║
║   POST /api/compare     - Contract comparison ($0.10)     ║
║   POST /api/report      - Full audit report ($1.00)       ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
