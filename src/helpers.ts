// Function signature decoder
const FN_SIGNATURES: Record<string, string> = {
  '0xaa57f09c': 'mint(address,address,bytes)',
  '0x095ea7b3': 'approve(address,uint256)',
  '0xa9059cbb': 'transfer(address,uint256)',
  '0x23b872dd': 'transferFrom(address,address,uint256)',
  '0x70a08231': 'balanceOf(address)',
  '0xdd62ed3e': 'allowance(address,address)',
  '0x18160ddd': 'totalSupply()',
  '0x313ce567': 'decimals()',
  '0x95d89b41': 'symbol()',
  '0x06fdde03': 'name()',
}

// Format callTracer output
export function formatCallTrace(trace: any, txInfo?: any, indent = 0): any {
  // If called with txInfo, format for display in the CLI
  if (txInfo) {
    let output = '\n🔍 TRANSACTION TRACE\n\n'

    // Transaction details
    output += `Transaction: ${txInfo.hash}\n`
    output += `From: ${txInfo.from}\n`
    output += `To: ${txInfo.to || 'Contract Creation'}\n`
    output += `Value: ${parseInt(txInfo.value || '0', 16)} wei\n`
    output += `Gas Limit: ${parseInt(txInfo.gas, 16)}\n`
    output += `Gas Price: ${parseInt(txInfo.gasPrice, 16)} wei\n\n`

    // Add function signature decoding if available
    if (txInfo.input && txInfo.input.length >= 10) {
      const methodId = txInfo.input.slice(0, 10)
      const signature = FN_SIGNATURES[methodId] || methodId
      output += `Function: ${signature}\n\n`
    }

    output += '📋 EXECUTION TRACE:\n\n'

    // Process the call tree recursively
    function processCall(call: any, depth: number): string {
      const indent = '  '.repeat(depth)
      let callOutput = ''

      // Call address info
      const callType =
        call.type === 'DELEGATECALL'
          ? 'DELEGATECALL to'
          : call.type === 'STATICCALL'
          ? 'STATICCALL to'
          : call.type === 'CALL'
          ? 'CALL to'
          : call.type

      callOutput += `${indent}${callType} ${call.to || 'Contract Creation'}`

      // Add function signature decoding if available
      if (call.input && call.input.length >= 10) {
        const methodId = call.input.slice(0, 10)
        const signature = FN_SIGNATURES[methodId] || methodId
        callOutput += ` [${signature}]`
      }

      // Add value if present
      if (call.value && parseInt(call.value, 16) > 0) {
        callOutput += ` value: ${parseInt(call.value, 16)} wei`
      }

      // Add gas info
      callOutput += ` gas: ${call.gas} → ${call.gasUsed}\n`

      // Add error info
      if (call.error) {
        callOutput += `${indent}❌ ERROR: ${call.error}\n`
      }

      // Process output
      if (call.output && call.output.length > 2 && !call.error) {
        // Try to decode output - this is simplified
        callOutput += `${indent}📤 Output: ${call.output.slice(0, 66)}${call.output.length > 66 ? '...' : ''}\n`
      }

      // Process logs/events if available
      if (call.logs && call.logs.length > 0) {
        callOutput += `${indent}📝 Events: ${call.logs.length} event(s)\n`
      }

      // Process calls recursively
      if (call.calls && call.calls.length > 0) {
        for (const subcall of call.calls) {
          callOutput += processCall(subcall, depth + 1)
        }
      }

      return callOutput
    }

    output += processCall(trace, 0)

    return output
  }

  // Otherwise format for JSON response in the REST API
  if (!trace) return null

  const indentStr = ' '.repeat(indent * 2)
  const result: any = {
    from: trace.from,
    to: trace.to,
    value: trace.value,
    gas: trace.gas,
    gasUsed: trace.gasUsed,
    input: trace.input?.length > 66 ? `${trace.input.slice(0, 66)}...` : trace.input,
  }

  if (trace.error) {
    result.error = trace.error
  } else if (trace.output) {
    result.output = trace.output.length > 66 ? `${trace.output.slice(0, 66)}...` : trace.output
  }

  if (trace.calls && trace.calls.length > 0) {
    result.calls = trace.calls.map((call: any) => formatCallTrace(call, undefined, indent + 1))
  }

  return result
}

// Format raw VM trace output
export function formatRawTrace(trace: any, txInfo?: any): any {
  // If called with txInfo, format for display in the CLI
  if (txInfo) {
    let output = '\n🔍 TRANSACTION TRACE\n\n'

    // Transaction details
    output += `Transaction: ${txInfo.hash}\n`
    output += `From: ${txInfo.from}\n`
    output += `To: ${txInfo.to || 'Contract Creation'}\n`
    output += `Value: ${parseInt(txInfo.value || '0', 16)} wei\n`
    output += `Gas Limit: ${parseInt(txInfo.gas, 16)}\n`
    output += `Gas Price: ${parseInt(txInfo.gasPrice, 16)} wei\n\n`

    // Add function signature decoding if available
    if (txInfo.input && txInfo.input.length >= 10) {
      const methodId = txInfo.input.slice(0, 10)
      const signature = FN_SIGNATURES[methodId] || methodId
      output += `Function: ${signature}\n\n`
    }

    output += '📋 VM EXECUTION TRACE:\n\n'

    // Process opcodes - simplified for readability
    let lastDepth = 0
    let ops = 0
    const maxOps = 300 // Limit trace output to not overwhelm with huge traces

    if (trace && trace.structLogs) {
      for (const log of trace.structLogs) {
        if (ops >= maxOps) {
          output += `\n... trace truncated (showing ${maxOps} of ${trace.structLogs.length} operations) ...\n`
          break
        }

        // Only show depth changes and interesting opcodes
        if (
          log.depth !== lastDepth ||
          [
            'CALL',
            'STATICCALL',
            'DELEGATECALL',
            'CREATE',
            'REVERT',
            'RETURN',
            'SELFDESTRUCT',
            'LOG0',
            'LOG1',
            'LOG2',
            'LOG3',
            'LOG4',
          ].includes(log.op)
        ) {
          const indent = '  '.repeat(log.depth)
          output += `${indent}[${log.pc}] ${log.op} (gas: ${log.gas} → ${log.gas - (log.gasCost || 0)})\n`

          // Show stack for interesting operations
          if (
            ['CALL', 'STATICCALL', 'DELEGATECALL', 'CREATE', 'REVERT'].includes(log.op) &&
            log.stack &&
            log.stack.length > 0
          ) {
            output += `${indent}  Stack: ${log.stack.slice(-4).join(', ')}\n`
          }

          // Show storage changes
          if (log.storage) {
            output += `${indent}  Storage: ${JSON.stringify(log.storage)}\n`
          }

          lastDepth = log.depth
          ops++
        }
      }
    } else {
      output += 'Raw trace data not available or in unexpected format.\n'
    }

    // Add gas usage summary
    if (trace && trace.gas !== undefined) {
      output += `\nGas used: ${trace.gas}\n`
    }

    return output
  }

  // Otherwise format for JSON response in the REST API
  if (!trace) return null

  // Clean up the trace result to make it more readable
  const formattedTrace = {
    gas: trace.gas,
    returnValue: trace.returnValue,
    failed: trace.failed,
    structLogs: trace.structLogs?.slice(0, 50).map((log: any) => ({
      pc: log.pc,
      op: log.op,
      gas: log.gas,
      gasCost: log.gasCost,
      depth: log.depth,
      stack: log.stack?.slice(0, 5) || [],
      memory: log.memory?.slice(0, 3) || [],
    })),
  }

  if (trace.structLogs && trace.structLogs.length > 50) {
    formattedTrace.structLogs.push({note: `... ${trace.structLogs.length - 50} more log entries (truncated)`})
  }

  return formattedTrace
}
