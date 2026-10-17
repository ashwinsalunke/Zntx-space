import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Compass } from "lucide-react";
import { GUIDE_TOOLS, guideToolPath } from "../shared/research-guide.js";
import { ResearchText } from "./AiPanel.jsx";

export default function ResearchGuideReply({ guide, onReply, busy }) {
  return <section className="research-guide" aria-label="ScrapeTx research guidance">
    <div className="research-guide-label"><Compass size={18} aria-hidden="true"/><strong>ScrapeTx AI · Your research guide</strong></div>
    <ResearchText text={guide.reply} />
    {!!guide.steps?.length && <ol className="research-guide-steps">{guide.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>}
    {!!guide.actions.length && <div className="research-guide-actions" aria-label="Next steps">
      {guide.actions.map(id => GUIDE_TOOLS[id] && <Link className="btn" key={id} to={guideToolPath(id, guide.topic)}>{GUIDE_TOOLS[id].label}<ArrowRight size={15} aria-hidden="true"/></Link>)}
    </div>}
    {guide.question && <p className="research-guide-question">{guide.question}</p>}
    <div className="research-guide-suggestions">{guide.suggestions.map(reply => <button className="btn" key={reply} disabled={busy} onClick={() => onReply(reply)}>{reply}</button>)}</div>
    <small className="research-guide-note">Choose a tool above to continue your project, or keep talking below.</small>
  </section>;
}
