import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpLeft, ArrowUpRight } from 'lucide-react';
import './prompt-suggestions.css';

export default function PromptSuggestions({ examples = [], onChoose, value = '', disabled = false, title = 'Try an example', hint = 'Choose one to fill the input, then edit it or run the tool.', inputId }) {
  const id = useId();
  const [pending, setPending] = useState(null);
  const [message, setMessage] = useState('');
  if (!examples.length) return null;
  function apply(example) {
    onChoose(example);
    setPending(null);
    setMessage('Example added. You can edit it before continuing.');
    if (inputId) document.getElementById(inputId)?.focus();
  }
  function choose(example) {
    setMessage('');
    if (value.trim() && value.trim() !== example.trim()) setPending(example);
    else apply(example);
  }
  return <section className="prompt-suggestions" aria-labelledby={id}>
    <div className="prompt-suggestions-heading"><strong id={id}>{title}</strong><span>{hint}</span></div>
    <div className="prompt-suggestions-items">{examples.map(item => {
      const text = typeof item === 'string' ? item : item.value;
      const label = typeof item === 'string' ? item : item.label;
      return onChoose ? <button key={label} type="button" disabled={disabled} onClick={() => choose(text)}><ArrowUpLeft size={15} aria-hidden="true"/><span>{label}</span></button>
        : <Link key={label} to={'/chat?guide=1&q=' + encodeURIComponent(text)}><span>{label}</span><ArrowUpRight size={15} aria-hidden="true"/></Link>;
    })}</div>
    {pending && <div className="prompt-suggestions-confirm"><span>Replace your current input with this example?</span><button type="button" disabled={disabled} onClick={() => apply(pending)}>Use example</button><button type="button" onClick={() => setPending(null)}>Keep my text</button></div>}
    <span className="sr-only" role="status">{message}</span>
  </section>;
}
