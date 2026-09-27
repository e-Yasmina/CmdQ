import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { CopyIcon } from './icons/CopyIcon';
import SaveFileDialog from './SaveFileDialog';

export function cleanAiResponse(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text
    .replace(/__CMDQ_DONE__/g, '')
    .replace(/__CMDQ_START__/g, '');

  // Fix orphaned punctuation on a newline after inline code, words, or brackets (e.g. "`code`\n," or "\n).")
  cleaned = cleaned.replace(/(`)\s*\n\s*([,\.;\)\:\]]+)/g, '$1$2');
  cleaned = cleaned.replace(/(\w+)\s*\n\s*([,\.;\)\:\]]+)/g, '$1$2');

  // Collapse 3 or more newlines into 2
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Trim trailing whitespace per line
  cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');

  // Remove redundant blank lines around horizontal rules
  cleaned = cleaned.replace(/\n+\s*---\s*\n+/g, '\n\n---\n\n');

  return cleaned.trim();
}

export function parseCliSteps(text) {
  const cleaned = cleanAiResponse(text);
  if (!cleaned) return [];

  const stepRegex = /\[Step\s+(\d+)\]\s*\((human|ai|user|assistant|tool|system)\):?/gi;
  const matches = [...cleaned.matchAll(stepRegex)];

  if (matches.length === 0) {
    return [{ step: null, role: 'ai', content: cleaned }];
  }

  const steps = [];
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const nextMatch = matches[i + 1];
    const startIndex = currentMatch.index + currentMatch[0].length;
    const endIndex = nextMatch ? nextMatch.index : cleaned.length;
    let stepContent = cleaned.slice(startIndex, endIndex).trim();
    stepContent = stepContent.replace(/^---\s*/, '').replace(/\s*---$/, '').trim();

    steps.push({
      step: currentMatch[1],
      role: currentMatch[2].toLowerCase(),
      content: stepContent
    });
  }

  return steps;
}

export default function AiMessageRenderer({ content, onExecuteSql }) {
  const [saveDialog, setSaveDialog] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  if (!content) return null;

  const steps = parseCliSteps(content);

  const handleCopyCode = (code, key) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const renderMarkdownBlock = (markdownText, blockPrefix = '') => {
    let codeBlockCount = 0;

    return (
      <div className="text-textPrimary text-xs leading-normal font-ui select-text">
        <ReactMarkdown
          components={{
            pre: ({ children }) => <>{children}</>,
            h1: ({ node, ...props }) => <h1 className="text-sm font-black mt-2 mb-1 text-primary tracking-tight" {...props} />,
            h2: ({ node, ...props }) => <h2 className="text-xs font-bold mt-2 mb-0.5 text-primary uppercase tracking-wide" {...props} />,
            h3: ({ node, ...props }) => <h3 className="text-xs font-bold mt-1.5 mb-0.5 text-primary" {...props} />,
            h4: ({ node, ...props }) => <h4 className="text-xs font-semibold mt-1 mb-0.5 text-textPrimary" {...props} />,
            p: ({ node, ...props }) => <p className="mb-1.5 last:mb-0" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5 text-textPrimary" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5 text-textPrimary" {...props} />,
            li: ({ node, ...props }) => <li className="text-textPrimary my-0" {...props} />,
            strong: ({ node, ...props }) => <strong className="font-bold text-textPrimary" {...props} />,
            em: ({ node, ...props }) => <em className="italic text-textSecondary opacity-80" {...props} />,
            hr: () => <hr className="border-border/30 my-2" />,
            blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-primary/60 pl-2.5 my-1.5 text-textSecondary italic" {...props} />,
            code: ({ node, className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '');
              const lang = match ? match[1] : '';
              const codeString = String(children).replace(/\n$/, '');
              const isInline = !className && !codeString.includes('\n');

              if (isInline) {
                return (
                  <code className="bg-black/40 text-emerald-400 px-1 py-0.5 rounded text-[11px] font-code border border-border/30 inline" {...props}>
                    {children}
                  </code>
                );
              }

              const codeIndex = `${blockPrefix}_${codeBlockCount++}`;
              const isCopied = copiedKey === codeIndex;
              const isSql = lang.toLowerCase() === 'sql' || codeString.toLowerCase().includes('select ') || codeString.toLowerCase().includes('alter table');

              return (
                <div className="my-2 rounded border border-border/60 overflow-hidden bg-black/50 shadow-sm">
                  <div className="bg-panel/90 px-2.5 py-0.5 text-[10px] text-gray-400 uppercase flex justify-between items-center border-b border-border/40 font-code">
                    <span className="font-bold text-primary">{lang || 'code'}</span>
                    <div className="flex items-center gap-2">
                      {isSql && onExecuteSql && (
                        <button
                          onClick={() => onExecuteSql(codeString)}
                          className="text-primary hover:brightness-125 transition-colors font-bold flex items-center gap-1 cursor-pointer"
                          title="Run SQL query"
                        >
                          ▶ Run SQL
                        </button>
                      )}
                      <button
                        onClick={() => handleCopyCode(codeString, codeIndex)}
                        className="text-gray-400 hover:text-primary transition-colors flex items-center gap-1 cursor-pointer bg-transparent px-1 py-0.5 rounded"
                        title="Copy code block"
                      >
                        {isCopied ? (
                          <>
                            <svg className="w-3 h-3 text-emerald-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <CopyIcon className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setSaveDialog({ content: codeString, filename: `snippet_${Date.now()}.${lang || 'txt'}` })}
                        className="text-cyan-400 hover:text-cyan-300 transition-colors font-bold cursor-pointer"
                      >
                        Save to file
                      </button>
                    </div>
                  </div>
                  <pre className="p-2.5 text-xs text-gray-200 font-code overflow-x-auto leading-normal select-text">
                    <code>{codeString}</code>
                  </pre>
                </div>
              );
            }
          }}
        >
          {markdownText}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 w-full select-text">
      {steps.map((s, idx) => {
        const isHuman = s.role === 'human' || s.role === 'user';
        const roleLabel = isHuman ? 'Human Prompt' : s.role === 'tool' ? 'Tool Output' : 'AI Response';
        const roleBadgeColor = isHuman
          ? 'bg-primary/10 text-primary border-primary/30'
          : s.role === 'tool'
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
            : 'bg-secondary/10 text-secondary border-secondary/30';

        return (
          <div key={idx} className="flex flex-col gap-1 w-full">
            {s.step !== null && (
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${roleBadgeColor}`}>
                  Step {s.step} • {roleLabel}
                </span>
              </div>
            )}
            <div className={`w-full ${isHuman ? 'bg-white/5 p-2 rounded border border-border/40 font-code text-primary' : ''}`}>
              {isHuman ? (
                <div className="text-xs font-semibold">{s.content}</div>
              ) : (
                renderMarkdownBlock(s.content, `step_${idx}`)
              )}
            </div>
          </div>
        );
      })}

      {saveDialog && (
        <SaveFileDialog
          content={saveDialog.content}
          defaultFilename={saveDialog.filename}
          onClose={() => setSaveDialog(null)}
        />
      )}
    </div>
  );
}
