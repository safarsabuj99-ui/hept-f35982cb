import { useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CodeBlock({ className, children }: { className?: string; children: any }) {
  const [copied, setCopied] = useState(false);
  const lang = (className || "").replace("language-", "") || "text";
  const text = String(children).replace(/\n$/, "");
  return (
    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-border/60 bg-zinc-950">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-white/[0.02]">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-mono">{lang}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-100 transition"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[12px] leading-relaxed text-zinc-100 font-mono">
        <code>{text}</code>
      </pre>
    </div>
  );
}

function ChatMarkdownImpl({ children }: { children: string }) {
  return (
    <div className="chat-prose text-[14.5px] leading-7 text-foreground/95">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          h1: ({ children }) => <h1 className="text-xl font-semibold mt-5 mb-2 tracking-tight">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-semibold mt-4 mb-2 tracking-tight">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-1.5">{children}</h3>,
          ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1 marker:text-muted-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1 marker:text-muted-foreground">{children}</ol>,
          li: ({ children }) => <li className="leading-7">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-2 border-primary/60 bg-muted/30 pl-3 py-1 italic text-foreground/80">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-border/60" />,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full text-[13px] border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/40">{children}</thead>,
          th: ({ children }) => <th className="px-3 py-2 text-left font-semibold border-b border-border/60">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 border-b border-border/40 align-top">{children}</td>,
          tr: ({ children }) => <tr className="even:bg-muted/20">{children}</tr>,
          code: ({ className, children, ...props }: any) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded-md bg-muted/70 border border-border/40 font-mono text-[12.5px] text-foreground" {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          pre: ({ children }: any) => <>{children}</>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export const ChatMarkdown = memo(ChatMarkdownImpl);
