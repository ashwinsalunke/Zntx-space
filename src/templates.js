// Original writing starters. Linked guidance is attribution, not publisher approval.
const section = (heading, prompt) => ({ heading, prompt });
const commonEnd = [
  section("Limitations", "Describe uncertainty, missing evidence, potential bias, and limits to generalizability."),
  section("References", "Add verified references and original source links. Check the required citation style."),
];
const research = [
  section("Abstract", "Summarize the question, methods, principal results, and conclusion after completing the manuscript."),
  section("Introduction", "Explain the research problem, relevant evidence, remaining gap, and study objective."),
  section("Materials and methods", "Describe the design, materials, participants or datasets, procedures, and analysis so the work can be assessed and reproduced."),
  section("Results", "Report your observed results with appropriate uncertainty and references to tables and figures. Do not invent data."),
  section("Discussion", "Interpret the results in relation to existing evidence, alternative explanations, and the study objective."),
  ...commonEnd,
];
const review = [
  section("Abstract", "State the review question, scope, main themes, and remaining gaps."),
  section("Introduction", "Define the topic, its significance, and the boundaries of the review."),
  section("Search approach", "Record the databases, search terms, dates, and selection criteria used to find the sources."),
  section("Evidence by theme", "Compare the source findings by theme, study design, population, and outcome. Link each claim to its source."),
  section("Discussion", "Explain agreements, disagreements, methodological differences, and unanswered questions."),
  ...commonEnd,
];
const proposal = [
  section("Background and rationale", "Describe the problem, existing evidence, and the gap your project will address."),
  section("Research question and objectives", "Define a focused question and measurable objectives. Separate hypotheses from established findings."),
  section("Proposed methods", "Describe the design, data or materials, selection criteria, procedures, and planned analysis."),
  section("Ethics and data management", "Describe approvals, consent, privacy protections, access, and retention requirements that apply to the project."),
  section("Work plan and resources", "Set milestones, feasibility checks, required resources, and a realistic timeline."),
  section("Expected contribution", "Describe the contribution you aim to make without predicting results as facts."),
  ...commonEnd,
];
const make = (id, title, kind, description, topics, sections, extra = {}) => ({
  id, title, kind, description, topics, sections,
  publisher: "scrapeTx", university: "", access: "Not specified", ranking: null,
  origin: "Original writing starter", ...extra,
});

export const templates = [
  make("journal-of-epidemiology-and-global-health", "Journal of Epidemiology and Global Health", "Journal Article", "The JEGH manuscript structure and two-column layout from your supplied LaTeX template.", ["Medicine", "Biology"], [
    section("Abstract", "Summarize the question, methods, supported findings, and limitations."),
    section("Keywords", "Provide specific keywords separated by semicolons."),
    section("Introduction", "Explain the research question and cite the original supporting sources."),
    section("Methods", "Describe only methods actually performed. Clearly identify missing study data."),
    section("Results", "Report supplied results, or distinguish a bounded literature summary from original findings."),
    section("References", "Include only real sources cited in the manuscript, with original source links."),
  ], { publisher: "Atlantis Press", layoutId: "jegh", origin: "User-supplied LaTeX template", guidanceUrl: "https://d-nb.info/1385649526/34", guidanceLabel: "Source article used by the supplied template", guidanceNote: "Based on the LaTeX file supplied on 18 October 2026. Layout: 210 × 279 mm, two columns, 10 pt Times-like text. These are supplied-template specifications; check current journal guidance before submitting." }),
  make("research-paper", "Research Paper", "Journal Article", "A research manuscript from abstract to references.", ["Medicine", "Biology", "Chemistry", "Engineering"], research),
  make("literature-review", "Literature Review", "Journal Article", "A thematic review that keeps claims connected to their sources.", ["Medicine", "Biology", "Chemistry", "Social Sciences"], review),
  make("pharma-literature-review", "Pharmaceutical Literature Review", "Journal Article", "Compare drug evidence, study populations, efficacy outcomes, and safety findings.", ["Medicine", "Pharmacology"], [
    section("Review question", "Define the drug or drug class, indication, population, and outcomes of interest."),
    section("Search and selection", "Record databases, query strings, search dates, inclusion criteria, and exclusions."),
    section("Mechanism and pharmacology", "Summarize source-supported mechanisms and pharmacological properties. Separate preclinical and human evidence."),
    section("Clinical evidence", "Compare study designs, populations, interventions, comparators, endpoints, and follow-up periods."),
    section("Safety evidence", "Distinguish trial adverse events, label warnings, and spontaneous reports. Do not infer causation or incidence from report counts."),
    section("Evidence gaps", "Discuss risk of bias, incomplete reporting, applicability, and questions for further study."),
    section("References", "Cite the original studies, labels, and registered trial records."),
  ]),
  make("systematic-review", "Systematic Review", "Journal Article", "A structured starting point for documenting a reproducible evidence review.", ["Medicine", "Biology", "Social Sciences"], [
    section("Abstract", "Summarize the question, eligibility criteria, sources searched, included studies, and principal findings."),
    section("Objectives and eligibility", "Define the review question and prespecified inclusion and exclusion criteria."),
    section("Search methods", "Document databases, full search strategies, dates, screening procedures, and protocol registration if applicable."),
    section("Data extraction and appraisal", "Define extracted fields, reviewer procedures, risk-of-bias methods, and planned synthesis."),
    section("Results", "Report study selection, characteristics, appraisal, and synthesis using your actual review data."),
    section("Discussion", "Interpret the findings and strength of evidence without overstating completeness."),
    ...commonEnd,
  ]),
  make("scoping-review", "Scoping Review", "Journal Article", "Map the extent, characteristics, and gaps of a body of literature.", ["Medicine", "Biology", "Social Sciences"], [
    section("Scope and objectives", "Define the population, concepts, and context to be mapped."),
    section("Methods", "Record eligibility criteria, information sources, search strategy, screening, and charting procedures."),
    section("Evidence map", "Chart the included sources by methods, setting, concepts, and evidence type."),
    section("Research gaps", "Describe underexplored areas and the limitations of the map."),
    ...commonEnd,
  ]),
  make("plos-one", "PLOS ONE Research Article", "Journal Article", "An editable manuscript outline with a link to PLOS ONE submission guidance.", ["Medicine", "Biology", "Chemistry"], [
    section("Title page", "Enter the manuscript title, author names, affiliations, and corresponding author."),
    ...research.slice(0, 5),
    section("Acknowledgments", "Acknowledge contributions that do not qualify for authorship."),
    section("References", "Insert verified source references and check the journal's current instructions."),
    section("Supporting information", "List supporting files and captions where applicable."),
  ], { publisher: "PLOS", access: "Open Access", origin: "Guidance-linked starter", guidanceUrl: "https://journals.plos.org/plosone/s/submission-guidelines", guidanceLabel: "PLOS ONE submission guidelines", checkedAt: "2026-10-16", guidanceNote: "An original outline following the journal's published manuscript organization. Check its current formatting and submission requirements before submitting." }),
  make("frontiers-original-research", "Frontiers Original Research", "Journal Article", "A primary research outline with sections for reporting and declarations.", ["Medicine", "Biology", "Pharmacology"], [
    ...research.slice(0, 5),
    section("Data availability", "State where the underlying data can be accessed and explain any restrictions."),
    section("Ethics statement", "Record applicable ethical review and consent information."),
    section("Author contributions", "Describe each author's actual contribution."),
    section("Funding and competing interests", "Disclose funding sources and relevant competing interests."),
    section("References", "Add verified references and check the selected journal and article-type guidance."),
  ], { publisher: "Frontiers", access: "Open Access", origin: "Guidance-linked starter", guidanceUrl: "https://www.frontiersin.org/guidelines/author-guidelines", guidanceLabel: "Frontiers author guidelines", checkedAt: "2026-10-16", guidanceNote: "An original writing starter linked to Frontiers guidance. Requirements vary by journal and article type; this is not a publisher-approved document file." }),
  make("bmj-open-protocol", "BMJ Open Study Protocol", "Journal Article", "Plan a study with an explicit methods, ethics, and dissemination structure.", ["Medicine"], [
    section("Abstract", "Summarize the introduction, methods and analysis, ethics, and dissemination plan."),
    section("Strengths and limitations", "Record design strengths and anticipated methodological limitations."),
    section("Introduction", "Explain the evidence gap and study objectives."),
    section("Methods and analysis", "Specify the design, setting, eligibility, recruitment, outcomes, sample-size rationale, and planned analysis."),
    section("Ethics and dissemination", "Document required review, consent, and how results will be communicated."),
    section("Patient and public involvement", "Describe actual involvement or explain its absence."),
    section("References", "Add the original evidence supporting the planned study."),
  ], { publisher: "BMJ", access: "Open Access", origin: "Guidance-linked starter", guidanceUrl: "https://bmjopen.bmj.com/pages/authors/", guidanceLabel: "BMJ Open author information", checkedAt: "2026-10-16", guidanceNote: "A study-planning outline linked to the journal's author information. Confirm the current article-type requirements and reporting checklist." }),
  make("research-proposal", "Research Proposal", "Research Proposal", "Frame a focused question, methods, feasibility, and contribution.", ["Medicine", "Biology", "Chemistry", "Engineering", "Social Sciences"], proposal),
  make("grant-proposal", "Grant Proposal", "Research Proposal", "Organize a funding application around aims, approach, and resources.", ["Medicine", "Biology", "Engineering"], [
    section("Project summary", "Describe the problem, proposed approach, and intended contribution concisely."),
    section("Specific aims", "Set out the objectives, rationale, and testable questions."),
    section("Significance and prior work", "Connect the project to verified evidence and explain the remaining need."),
    section("Research plan", "Specify methods, milestones, risks, alternatives, and assessment criteria."),
    section("Budget justification", "Explain the actual costs and resources needed. Match the funding call's rules."),
    section("References", "Cite the work supporting the application."),
  ]),
  make("thesis-dissertation", "Thesis & Dissertation", "Thesis & Dissertation", "A complete research thesis structure with front matter and chapter prompts.", ["Medicine", "Biology", "Chemistry", "Engineering", "Social Sciences"], [
    section("Title page", "Enter the title, candidate name, degree, department, institution, and submission date."),
    section("Abstract", "Summarize the research problem, methods, results, and contribution."),
    section("Acknowledgments and declarations", "Add required declarations and acknowledge contributions according to your institution's rules."),
    section("Contents", "Prepare the contents, figures, tables, and abbreviations lists after the chapters are written."),
    section("Introduction", "State the problem, research questions, scope, and thesis organization."),
    section("Literature review", "Critically compare the relevant sources and identify the research gap."),
    section("Methodology", "Describe and justify the research design and analysis."),
    section("Results", "Present the actual research findings."),
    section("Discussion and conclusion", "Explain the contribution, uncertainty, limitations, and future work."),
    section("References and appendices", "Include verified references and supporting material."),
  ]),
  make("cambridge-thesis-planning", "Cambridge Thesis Planning", "Thesis & Dissertation", "A general thesis plan with the university's submission checklist alongside it.", ["Medicine", "Biology", "Engineering", "Social Sciences"], [
    section("Title page", "Record candidate, thesis title, degree, department, and date. Check the Degree Committee's requirements."),
    section("Declarations and front matter", "Consult the official checklist for required declarations, abstracts, and supporting forms."),
    section("Research chapters", "Develop the introduction, literature, methods, results, and discussion appropriate to the subject."),
    section("References and appendices", "Include verified references and approved additional materials."),
    section("Submission checks", "Review the university checklist and subject-specific rules. This outline does not format a submission-ready thesis."),
  ], { university: "University of Cambridge", origin: "Guidance-linked starter", guidanceUrl: "https://www.cambridgestudents.cam.ac.uk/files/pgr_thesis_submission_checklist.pdf", guidanceLabel: "Cambridge thesis submission checklist", checkedAt: "2026-10-16", guidanceNote: "This is a general planning document linked to the university checklist, not an official university template. Check your department's requirements." }),
  make("thesis-chapter", "Thesis Chapter", "Thesis & Dissertation", "Build a chapter around one research question and its evidence.", ["Medicine", "Biology", "Engineering", "Social Sciences"], [
    section("Chapter overview", "State the chapter's purpose and its relationship to the thesis."),
    section("Background", "Discuss the sources needed to understand the chapter's question."),
    section("Methods or analytical approach", "Explain how the question is investigated."),
    section("Findings and discussion", "Present your analysis and explain how the evidence supports it."),
    section("Chapter conclusion", "Summarize the contribution and connect it to the next chapter."),
    ...commonEnd,
  ]),
  make("case-study", "Case Study", "Journal Article", "Document context, observations, analysis, and source-supported interpretation.", ["Medicine", "Social Sciences"], [
    section("Abstract", "Summarize the context, observations, and learning points."),
    section("Background", "Explain why this case is worth examining."),
    section("Case description", "Report the relevant observations and timeline. Remove identifying information and obtain required consent."),
    section("Discussion", "Compare the case with published evidence and alternative explanations."),
    section("Learning points", "State what the case supports, with appropriate limits."),
    ...commonEnd,
  ]),
  make("book-chapter", "Book Chapter", "Book Chapter", "Develop a chapter within an edited research book.", ["Medicine", "Biology", "Engineering", "Social Sciences"], [
    section("Chapter abstract", "Summarize the scope and contribution."),
    section("Introduction", "Explain the chapter's place in the book and its intended audience."),
    section("Core concepts and evidence", "Develop the argument through clearly defined, source-supported themes."),
    section("Applications and examples", "Use attributed examples to explain how the concepts apply."),
    section("Conclusion", "Synthesize the main contribution and open questions."),
    section("References", "Add verified references in the style agreed with the editor."),
  ]),
  make("book-series-proposal", "Research Book Series Proposal", "Book Series", "Outline the scope, audience, and editorial plan for a book series.", ["Biology", "Engineering", "Social Sciences"], [
    section("Series rationale", "Explain the research need, scope, and intended audience."),
    section("Editorial plan", "Describe proposed editors, review procedures, and responsibilities."),
    section("Proposed volumes", "Outline prospective volumes, authors, and how they relate to the series."),
    section("Delivery plan", "Set a realistic schedule and identify resource needs."),
    section("References", "Cite works supporting the rationale and scope."),
  ]),
  make("conference-paper", "Conference Paper", "Conference Paper", "A concise research paper to adapt to your conference's requirements.", ["Medicine", "Engineering", "Social Sciences"], research),
  make("conference-abstract", "Conference Abstract", "Conference Abstract", "Draft a compact abstract with clear methods and results.", ["Medicine", "Biology", "Chemistry", "Engineering"], [
    section("Background", "State the problem and objective in a few sentences."),
    section("Methods", "Describe the design, data, and analysis concisely."),
    section("Results", "Report the actual principal findings. Do not replace missing results with expected outcomes."),
    section("Conclusion", "State what the findings support and any material limitation."),
    section("Keywords", "Choose the most specific indexing terms and check the conference's word limit."),
  ]),
  make("laboratory-protocol", "Laboratory Protocol", "Protocol", "Record materials, procedures, controls, and reproducibility details.", ["Biology", "Chemistry", "Pharmacology"], [
    section("Purpose and scope", "Identify the research procedure and its intended application."),
    section("Materials and prerequisites", "Record materials, instruments, approvals, training, and applicable safety documents."),
    section("Procedure", "Document the actual approved procedure with traceable steps and critical parameters."),
    section("Controls and quality checks", "Define controls, acceptance criteria, and documentation requirements."),
    section("Troubleshooting and limitations", "Describe observed issues and the procedure's boundaries."),
    section("References", "Cite the source methods and relevant standard operating procedures."),
  ]),
  make("working-paper", "Working Paper", "Working Paper", "Share an early research argument with its current limitations clearly marked.", ["Medicine", "Engineering", "Social Sciences"], [
    section("Abstract", "Summarize the question, approach, and current contribution."),
    section("Introduction and related work", "Define the problem and situate the argument in the literature."),
    section("Approach and analysis", "Present the methods or reasoning and supporting evidence."),
    section("Preliminary findings", "Report available findings and distinguish incomplete work from established results."),
    section("Open questions", "Identify what remains unresolved before formal submission."),
    ...commonEnd,
  ]),
];

export const templateById = (id) => templates.find((item) => item.id === id || item.title === id);
export const templatePath = (item) => "/?" + new URLSearchParams({ template: item.id });
export function templateContent(item) {
  return `# ${item.title}\n\nWriting starter — replace prompts with your own work and verified evidence.\n${item.guidanceUrl ? `\nGuidance: ${item.guidanceLabel}\n${item.guidanceUrl}\n${item.guidanceNote}\n` : ""}\n${item.sections.map(({ heading, prompt }) => `## ${heading}\n${prompt}`).join("\n\n")}\n`;
}
const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function filterTemplates({ query = "", kind = "", topic = [], publisher = [], university = [], access = [] } = {}, catalog = templates) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return catalog.filter((item) => (!kind || item.kind === kind)
    && (!topic.length || topic.some((value) => item.topics.includes(value)))
    && (!publisher.length || publisher.includes(item.publisher))
    && (!university.length || university.includes(item.university))
    && (!access.length || access.includes(item.access))
    && words.every((word) => normalize([item.title, item.description, item.kind, item.publisher, item.university, ...item.topics].join(" ")).includes(word)));
}
