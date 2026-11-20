# CollegeStat design references · 15 October 2026

Inspo MCP v0.1.16 was installed at the user's explicit request. The installer configured Codex, Cursor and Claude Desktop and reported a restart requirement. This session queried its documented public Streamable HTTP endpoint directly using standard MCP `tools/list` and `tools/call` requests, so no restart was needed for the actual research. No private repository code, student records or credentials were submitted to Inspo. Only a generic product/design brief and public category filters were sent.

The retained [Inspo research response](design/inspo-references-oct15.json) records one recommendation and four category searches: SaaS, AI, education, and service/agency. Selected screens were fetched with `get_screen`; Class Creator's captured design system and the canonical `features/bento` source were inspected too. The actual Babbel, Feedly, Canvas and NB Studio reference screenshots were visually inspected. Reference screenshots are QA/research assets; they are not embedded in the product.

| Source | Applied pattern |
| --- | --- |
| [Babbel](https://babbel.com) · Inspo `babbel-com` | Calm editorial typography, readable surface, and purposeful visual grouping below the hero. |
| [Class Creator](https://classcreator.io/) · Inspo `classcreator-io` | Approachable education-product hierarchy; clear discovery and account actions. |
| [Feedly](https://feedly.com) · Inspo `feedly-com` | Feature lanes with distinct tasks, compact previews, and consistent link placement. |
| [Canvas / Supernova AI](https://canvasapp.com/) · Inspo `canvasapp-com` | Clear workspace hierarchy, lightweight surfaces, visible navigation and actions. |
| [NB Studio](https://nbstudio.co.uk) · Inspo `nbstudio-co-uk--about` | Short section labels, restrained editorial spacing, and asymmetric lower-page headings. |
| [ChatGPT](https://chat.openai.com) · Inspo `chat-openai-com` | Quiet sidebar and a focused primary task in the student workspace. |
| [Linear](https://linear.app/features), [Raycast](https://www.raycast.com), [Stripe Atlas](https://stripe.com/atlas) | Additional primary-site reference for product narration and clear action hierarchy. |

The final owner direction overrides the initial palette/layout experiment: retain CollegeStat's cobalt blue, center the original headline and search, keep its existing React Bits PixelBlast background, and remove the split photo from the header. No new hero image is installed. Existing accessible motion/static-background behavior stays in `HeroBackground`.

Landing improvements include real university comparison controls, published ranking-edition links, sourced article cards with individual image credits, an accessible native FAQ, and direct discovery/workspace actions. The 404 uses an original native SVG illustration and a short recovery/search flow. No fictional university facts, testimonials, customer counts or application outcomes were added.

Article/source and ranking evidence are separately recorded in [article sources](ARTICLE-SOURCES-2026-10-15.md) and [ranking sources](DESIGN-RANKING-SOURCES-2026-10-15.md). Restricted ranking publishers are linked as references; unavailable positions are not inferred.
