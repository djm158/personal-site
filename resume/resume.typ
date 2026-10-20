// Layout for resume.pdf, matching the fullstack LaTeX résumé (10pt article, 0.45in margins).
// Content comes from resume.yaml; compile on its own with
// `typst compile --ignore-system-fonts resume/resume.typ`
#let data = yaml("resume.yaml")

// "2026-01" -> "January 2026"
#let format-date(year-month) = {
  let (year, month) = year-month.split("-").map(int)
  datetime(year: year, month: month, day: 1).display("[month repr:long] [year]")
}

#let format-range(start, end) = [#format-date(start) – #if end == none [Present] else [#format-date(end)]]

#set document(title: data.name + " – Résumé", author: data.name)
#set page(paper: "us-letter", margin: 0.45in)
#set text(font: "New Computer Modern", size: 10pt, lang: "en")
// 0.52em leading puts baselines 12pt apart at 10pt, as in LaTeX
#set par(justify: true, leading: 0.52em, spacing: 0.52em)
// Text starts 1.2em in, like enumitem's leftmargin=1.2em; items 1.5pt further apart than lines
#set list(indent: 0.2em, body-indent: 0.5em, spacing: 0.52em + 1.5pt)

// YAML strings are plain text, so Typst's smart quotes don't apply to them
#show "'": "’"

// \large bold uppercase title with \titlerule under it, kept with what follows
#show heading.where(level: 1): it => block(
  above: 12pt,
  below: 7pt,
  sticky: true,
  width: 100%,
  inset: (bottom: 3pt),
  stroke: (bottom: 0.4pt),
)[
  #set text(size: 12pt, weight: "bold")
  #upper(it.body)
]

// A role never splits across pages
#let role(r) = block(breakable: false, above: 10pt, below: 0pt)[
  #block(below: 0.52em + 2pt)[
    #strong(r.company) #h(1fr) #format-range(r.start, r.at("end", default: none)) \
    #emph(r.title) #h(1fr) #emph(r.location)
  ]
  #list(..r.bullets)
]

#let education(e) = {
  let details = (
    e.degree,
    if "honors" in e { emph(e.honors) },
    if "gpa" in e [GPA: #e.gpa],
  ).filter(it => it != none)

  [#strong(e.school) – #details.join[, ]]
}

#align(center)[
  #block(below: 3pt + 0.52em, text(size: 17.28pt, weight: "bold", upper(data.name)))
  #let contacts = ((label: data.email, url: "mailto:" + data.email),) + data.links
  #contacts.map(c => link(c.url, c.label)).join[#h(0.75em)|#h(0.75em)]
]

= Summary
#data.summary

= Experience
#for r in data.roles { role(r) }

= Technical Skills
#block[
  // Justified like the rest, but tool names are never hyphenated
  #set text(hyphenate: false)
  #set par(spacing: 0.52em + 1.5pt)
  #for s in data.skills [
    #strong(s.name + ":") #s.items.join(", ")

  ]
]

= Education
#for e in data.education { education(e) }

// Read by the build to enforce the page limit
#context [#metadata(counter(page).final().first()) <page-count>]
