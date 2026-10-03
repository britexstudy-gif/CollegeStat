/* eslint-disable @next/next/no-img-element -- Local editorial artwork. */
import Link from "next/link";
import { ArrowUpRight, Heart, Database, Code2, Flag } from "lucide-react";
const repository = "https://github.com/britexstudy-gif/CollegeStat";
const configuredURL = process.env.NEXT_PUBLIC_SUPPORT_URL || "";
const supportURL = /^https:\/\//.test(configuredURL) ? configuredURL : null;
const contributions = [
  { icon: Database, title: "Share a better source", text: "Know an official admissions page, a fresh dataset, or a missing campus photo? Help the next student find it.", label: "Suggest a source", titleParam: "Data contribution: " },
  { icon: Flag, title: "Help us get it right", text: "Found an outdated requirement, a broken link, or a university we missed? Send the page and an official reference.", label: "Report a correction", titleParam: "Data correction: " },
  { icon: Code2, title: "Build with us", text: "Improve accessibility, fix a bug, or help connect more public datasets. Small contributions make the directory better for everyone.", label: "Explore the repository", titleParam: "" },
];
export default function Support() {
  return <div className="research-page support-page">
    <header className="resource-hero">
      <div><span className="section-caption">Built for students. Better together.</span><h1>Keep possibility<br /><em>open to everyone.</em></h1>
        <p>CollegeStat helps students find their next chapter. Support the research, the tools, and the people making it possible.</p>
        <a className="button button-primary" href="#contribute">Find your way to help <Heart size={17} /></a>
      </div>
      <img src="/images/resources/funding.webp" alt="A globe held in an envelope on a cobalt background" width={1200} height={800} />
    </header>
    <section className="support-mission">
      <span className="section-caption">What your support makes possible</span><h2>More clarity. For more students.</h2>
      <div className="support-impact"><article><strong>01</strong><h3>Fresher information</h3><p>More official admissions links, dated requirements, and regular checks for changes.</p></article><article><strong>02</strong><h3>A wider world</h3><p>Better coverage beyond familiar names, with local sources and regional discovery.</p></article><article><strong>03</strong><h3>Useful, open tools</h3><p>Keep university discovery, comparison, and application guidance free to explore.</p></article></div>
    </section>
    <section id="contribute" className="support-contributions">
      {contributions.map(({icon: Icon, ...item}) => <article key={item.title}><Icon size={25}/><h2>{item.title}</h2><p>{item.text}</p><a className="text-link" href={repository + (item.titleParam ? "/issues/new?title=" + encodeURIComponent(item.titleParam) : "")} target="_blank" rel="noreferrer">{item.label}<ArrowUpRight size={15}/></a></article>)}
    </section>
    <section className="support-donate"><Heart size={30}/><div><h2>Help fund the next chapter.</h2><p>Contributions support source updates, hosting, and accessible research tools. Support never buys a ranking or university placement.</p></div>
      {supportURL ? <a href={supportURL} className="button button-primary" target="_blank" rel="noreferrer">Support CollegeStat <ArrowUpRight size={16}/></a> : <a href={repository + "/issues/new?title=Sponsorship%20enquiry"} className="button button-primary" target="_blank" rel="noreferrer">Discuss sponsorship <ArrowUpRight size={16}/></a>}
    </section>
    <section className="support-help"><h2>A few things to know.</h2>
      <details><summary>Is CollegeStat free to use?</summary><p>Yes. The university directory, rankings, comparison, and application guides are free to explore.</p></details>
      <details><summary>What should I include with a correction?</summary><p>Link to the university profile, explain what changed, and include an official source with its publication date or entry year. Please do not include personal application documents.</p></details>
      <details><summary>Where can I see the sources?</summary><p>Visit the <Link href="/sources">source library</Link> or the Sources tab on a university profile. Every published figure keeps its reporting year and origin.</p></details>
      <details><summary>Can a sponsor influence the rankings?</summary><p>No. Positions come from named publishers. Sponsorship has no effect on ranking positions or search order.</p></details>
    </section>
  </div>;
}
