import { useEffect, useRef, useState } from "react";
import { createCheckin, DuplicateNameError, getCount, RateLimitError } from "./api";
import ec2Icon from "./assets/aws/ec2.svg";
import rdsIcon from "./assets/aws/rds.svg";
import route53Icon from "./assets/aws/route-53.svg";
import s3Icon from "./assets/aws/s3.svg";

type Status = "idle" | "loading" | "success" | "error";

const NODES = [
  { key: "user", name: "User", label: "Usuário", icon: <UserIcon /> },
  { key: "r53", name: "Route 53", label: "jvictor.cloud", icon: <img src={route53Icon} alt="" /> },
  { key: "s3", name: "S3", label: "Frontend", icon: <img src={s3Icon} alt="" /> },
  { key: "ec2", name: "EC2", label: "Application", icon: <img src={ec2Icon} alt="" /> },
  { key: "rds", name: "RDS", label: "Database", icon: <img src={rdsIcon} alt="" /> },
];

const STEP_MS = 280;

export default function App() {
  const [total, setTotal] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [step, setStep] = useState(-1);
  const [message, setMessage] = useState({ text: "", error: false });
  const timers = useRef<number[]>([]);

  useEffect(() => {
    getCount()
      .then(setTotal)
      .catch(() => setMessage({ text: "Não consegui falar com a API. Ela está no ar?", error: true }));
    return () => timers.current.forEach(clearTimeout);
  }, []);

  async function handleCheckin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (status === "loading" || !trimmed) return;
    timers.current.forEach(clearTimeout);
    setStatus("loading");
    setMessage({ text: "", error: false });
    setStep(0);

    // Anima o pacote passando pela arquitetura enquanto a requisição acontece
    const animation = new Promise<void>((resolve) => {
      NODES.forEach((_, i) => {
        timers.current.push(window.setTimeout(() => setStep(i), i * STEP_MS));
      });
      timers.current.push(window.setTimeout(resolve, NODES.length * STEP_MS));
    });

    try {
      const [checkin] = await Promise.all([createCheckin(trimmed), animation]);
      setTotal(checkin.total);
      setStatus("success");
      setName("");
      setMessage({ text: `Valeu, ${checkin.name}! Check-in #${checkin.id} gravado no RDS.`, error: false });
    } catch (err) {
      await animation;
      // o rate limit barra a requisição na EC2, antes de chegar no RDS;
      // o nome duplicado é barrado pela constraint unique no próprio RDS
      if (err instanceof RateLimitError) setStep(NODES.findIndex((n) => n.key === "ec2"));
      if (err instanceof DuplicateNameError) setStep(NODES.findIndex((n) => n.key === "rds"));
      setStatus("error");
      setMessage({
        text:
          err instanceof RateLimitError
            ? "Calma! Muitos check-ins em pouco tempo. Tente de novo em instantes."
            : err instanceof DuplicateNameError
              ? `"${trimmed}" já fez check-in. Use outro nome.`
              : "Falhou no caminho até o banco. Confira a API e o CORS.",
        error: true,
      });
    } finally {
      timers.current.push(
        window.setTimeout(() => {
          setStatus((s) => (s === "loading" ? s : "idle"));
          setStep(-1);
        }, 2600),
      );
    }
  }

  return (
    <main className="page">
      <div className="cloud cloud--top" aria-hidden />
      <div className="cloud cloud--bottom" aria-hidden />

      <section className="hero">
        <h1>
          <span className="hero__title">Cloud Computing</span>
          <span className="hero__subtitle">conceitos, benefícios e primeiros passos na</span>
        </h1>
        <AwsLogo />
      </section>

      <section className="window" aria-label="Arquitetura na prática">
        <header className="window__bar">
          <span className="dot dot--red" />
          <span className="dot dot--yellow" />
          <span className="dot dot--green" />
          <span className="window__title">Arquitetura na prática</span>
          <span className="window__badge">AWS</span>
        </header>

        <form className="window__body" onSubmit={handleCheckin}>
          <ol className="flow">
            {NODES.map((node, i) => {
              const state =
                status === "error" && i === step
                  ? "error"
                  : i < step || (i === step && status !== "loading")
                    ? "done"
                    : i === step
                      ? "active"
                      : "";
              return (
                <li key={node.key} className={`flow__node flow__node--${node.key} ${state}`}>
                  <span className="flow__icon">{node.icon}</span>
                  <strong>{node.name}</strong>
                  {node.key === "user" ? (
                    <input
                      className="flow__input"
                      type="text"
                      placeholder="Seu nome"
                      aria-label="Seu nome"
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={status === "loading"}
                      required
                    />
                  ) : (
                    <small>{node.label}</small>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="action">
            <button
              type="submit"
              className={`cta cta--${status}`}
              disabled={status === "loading" || !name.trim()}
            >
              <span className="cta__glow" aria-hidden />
              <span className="cta__content">
                {status === "loading" ? (
                  <>
                    <span className="spinner" aria-hidden /> Enviando para a nuvem...
                  </>
                ) : status === "success" ? (
                  <>✓ Check-in feito!</>
                ) : (
                  <>
                    <CloudUpIcon /> Fazer check-in na nuvem
                  </>
                )}
              </span>
            </button>

            <div className="counter" aria-live="polite">
              <span className="counter__value" key={total ?? "none"}>
                {total ?? "–"}
              </span>
              <span className="counter__label">
                check-ins
                <br />
                no RDS
              </span>
            </div>

            <p className={`message ${message.error ? "message--error" : ""}`} role="status">
              {message.text}
            </p>
          </div>
        </form>
      </section>

      <footer className="footer">
        João Victor Marques · Infrastructure Engineer @ Cubo Tecnologia
      </footer>
    </main>
  );
}

function AwsLogo() {
  return (
    <svg className="aws-logo" viewBox="0 0 120 72" role="img" aria-label="AWS">
      <text x="4" y="40" fontFamily="Poppins, sans-serif" fontWeight="700" fontSize="44" fill="#232f3e">
        aws
      </text>
      <path d="M8 54 Q58 76 106 52" fill="none" stroke="#ff9900" strokeWidth="6" strokeLinecap="round" />
      <path d="M96 48 L108 51 L103 62" fill="none" stroke="#ff9900" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  );
}

function CloudUpIcon() {
  return (
    <svg className="cta__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8a4 4 0 0 1 0 10" />
      <path d="M12 12v8M9 15l3-3 3 3" />
    </svg>
  );
}
