// Values supplied by the user from their SciSpace JEGH template, 18 October 2026.
// They describe that supplied file, not a claim about current publisher requirements.
export const journalLayouts = Object.freeze({
  jegh: Object.freeze({
    id: "jegh", journal: "Journal of Epidemiology and Global Health",
    widthMm: 210, heightMm: 279, topMm: 12, bottomMm: 28, leftMm: 18, rightMm: 17,
    columns: 2, columnGapMm: 6, fontPt: 10,
  }),
});
export const latexEscape = value => String(value || "").replace(/[\\{}$&#%_^~]/g, c => ({"\\":"\\textbackslash{}","{":"\\{","}":"\\}","$":"\\$","&":"\\&","#":"\\#","%":"\\%","_":"\\_","^":"\\textasciicircum{}","~":"\\textasciitilde{}"})[c]);
export function journalPreamble(layout) {
  return String.raw`\documentclass[10pt,twocolumn]{article}
\usepackage{iftex}
\ifPDFTeX
  \usepackage[utf8]{inputenc}
  \usepackage[T1]{fontenc}
\fi
\usepackage[english]{babel}
\usepackage{graphicx,amsmath,booktabs,array,url}
\usepackage{newtxtext,newtxmath}
\usepackage[paperwidth=210mm,paperheight=279mm,top=12mm,bottom=28mm,left=18mm,right=17mm,columnsep=6mm]{geometry}
\usepackage{setspace}
\singlespacing
\usepackage{authblk}
\usepackage[numbers,sort&compress]{natbib}
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\small ` + latexEscape(layout.journal) + String.raw`}
\fancyhead[R]{\small\thepage}
\renewcommand{\headrulewidth}{0.4pt}
\usepackage[hidelinks]{hyperref}
\renewcommand{\refname}{References}`;
}

// Preserve the supplied file as the attachment; its example citation is a
// placeholder and is never admitted to the AI evidence list or generated references.
export const suppliedJeghTemplate = String.raw`%% Journal of Epidemiology and Global Health -- LaTeX manuscript template
%% Supplied by the user; originally prepared by SciSpace from journal documents.
%% Check current author guidelines before submitting.
%% Layout source: https://d-nb.info/1385649526/34
%% Publisher in supplied template: Atlantis Press
\documentclass[10pt,twocolumn]{article}
\usepackage{iftex}
\ifPDFTeX
  \usepackage[utf8]{inputenc}
  \usepackage[T1]{fontenc}
\fi
\usepackage[english]{babel}
\usepackage{graphicx,amsmath,booktabs,array,url}
\usepackage{newtxtext,newtxmath}
\usepackage[paperwidth=210mm,paperheight=279mm,top=12mm,bottom=28mm,left=18mm,right=17mm,columnsep=6mm]{geometry}
\usepackage{setspace}
\singlespacing
\usepackage{authblk}
\usepackage[numbers,sort&compress]{natbib}
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\small Journal of Epidemiology and Global Health}
\fancyhead[R]{\small\thepage}
\renewcommand{\headrulewidth}{0.4pt}
\usepackage[hidelinks]{hyperref}
\renewcommand{\refname}{References}

\begin{filecontents*}[overwrite]{references.bib}
@article{example2024,
  author  = {Surname, Firstname and Surname, Second},
  title   = {Title of the cited article},
  journal = {Journal of Epidemiology and Global Health},
  year    = {2024},
  volume  = {1},
  number  = {1},
  pages   = {1--10},
  doi     = {10.0000/example}
}
\end{filecontents*}

\title{Title of the Manuscript}
\author[1]{First Author}
\author[2]{Second Author\thanks{Corresponding author: \texttt{email@example.com}}}
\affil[1]{Department, Institution, City, Country}
\affil[2]{Department, Institution, City, Country}
\date{}

\begin{document}
\twocolumn[
\maketitle
\begin{minipage}{\textwidth}
\noindent\textbf{Abstract}
\par\smallskip
\noindent Write the abstract here.
\par\medskip
\noindent\textbf{Keywords:} keyword one; keyword two; keyword three
\end{minipage}
\bigskip]

\section{Introduction}
Text of the section. Cite sources like this \cite{example2024}.

\section{Methods}
Text of the section.

\begin{table}[ht]
\centering
\caption{Table caption (placed above the table).}
\label{tab:example}
\begin{tabular}{lcc}
\toprule
Item & Value 1 & Value 2 \\
\midrule
A & 0.00 & 0.00 \\
B & 0.00 & 0.00 \\
\bottomrule
\end{tabular}
\end{table}

\section{Results}
Text of the section.

\begin{figure}[ht]
\centering
\rule{0.8\columnwidth}{0.4\columnwidth}
\caption{Figure caption (placed below the figure).}
\label{fig:example}
\end{figure}

\bibliographystyle{unsrtnat}
\bibliography{references}
\end{document}
`;
