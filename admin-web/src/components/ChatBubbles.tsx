// .bubble .b-me/.b-them — shared by the job chat thread (jobs/[id]
// ?view=chat, mirrors W6-thread) and the Messages inbox (W10-inbox). One
// rendering, two call sites — plan §5 W-09a "mirrors the mobile M12/admin W6
// chat bubble pattern".
import type { ChatMessage } from "@/data/contracts/chat";

export function ChatBubbles({
  messages,
  emptyLabel = "No messages yet.",
}: {
  messages: ChatMessage[];
  emptyLabel?: string;
}) {
  if (messages.length === 0) return <div className="t-sub">{emptyLabel}</div>;
  return (
    <>
      {messages.map((m) =>
        m.from === "them" ? (
          <div key={m.id}>
            <div className="bubble b-them">{m.text}</div>
            <div className="b-time">{m.at}</div>
          </div>
        ) : (
          <div
            key={m.id}
            style={{ alignSelf: "flex-end", display: "flex", flexDirection: "column", alignItems: "flex-end" }}
          >
            <div className="bubble b-me">{m.text}</div>
            <div className="b-time">{m.at}</div>
          </div>
        )
      )}
    </>
  );
}
