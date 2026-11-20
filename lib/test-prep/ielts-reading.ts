import type { IeltsReadingTest } from "./types";

/** Two full IELTS Academic Reading tests: three passages, 40 questions, 60
 * minutes each. Passages and questions are original CollegeStat material
 * written to the public IELTS task formats. */

const TF = "Do the following statements agree with the information given in the passage? Choose TRUE if the statement agrees with the information, FALSE if the statement contradicts the information, or NOT GIVEN if there is no information on this.";
const YN = "Do the following statements agree with the claims of the writer? Choose YES if the statement agrees with the claims of the writer, NO if the statement contradicts the claims of the writer, or NOT GIVEN if it is impossible to say what the writer thinks about this.";

export const IELTS_READING: IeltsReadingTest[] = [
  {
    id: "ielts-reading-1",
    title: "Reading test 1",
    passages: [
      {
        title: "The shrinking of the Aral Sea",
        paragraphs: [
          { text: "Until the middle of the twentieth century, the Aral Sea, which lies across the border between present-day Kazakhstan and Uzbekistan, was one of the largest lakes on Earth. It had no outlet to the ocean. Instead, its level was held in balance by two great rivers, the Amu Darya from the south and the Syr Darya from the north-east, which carried snowmelt from distant mountains across the desert. Water flowing in roughly matched water lost to evaporation, and fishing towns such as Aral in the north and Muynak in the south prospered on its shores." },
          { text: "That balance changed from the 1960s, when planners in the Soviet Union decided to expand irrigated agriculture across Central Asia on a vast scale. Cotton, a crop that needs a great deal of water during the hot summer, was the main priority. Thousands of kilometres of canals were dug to take water from both rivers to new fields. Many of these canals were unlined, so a large share of the water soaked into the sand or evaporated before it ever reached a plant. Within a few years, the volume of water arriving at the sea had fallen sharply, and in some dry years almost none reached it at all." },
          { text: "The sea began to retreat. Because its basin was shallow, even a small fall in level exposed enormous areas of former seabed. By the late 1980s the water had divided into two separate bodies: a smaller northern sea, fed by the Syr Darya, and a much larger southern sea, fed by what remained of the Amu Darya. As the water shrank, the salt in it became more concentrated, and most native fish species could no longer survive. The fishing industry, which had once employed tens of thousands of people, collapsed. Rusting ships were left stranded on dry land many kilometres from the new shoreline." },
          { text: "The consequences reached far beyond fishing. Winds now lift salt and dust from the dried seabed, a new desert often called the Aralkum, and carry them across farmland and towns. Doctors in the region have reported high rates of respiratory illness, although it is difficult to separate the effect of dust from other causes such as poor water quality. The local climate also appears to have become more extreme, with hotter summers and colder winters, because a large body of water no longer moderates the temperature." },
          { text: "For many years the disaster was regarded as irreversible. However, the northern part has shown that partial recovery is possible. In 2005 Kazakhstan completed the Kokaral Dam, a thirteen-kilometre barrier that stops water from the Syr Darya flowing south into the larger basin, where it would simply evaporate. The project, supported by a loan from the World Bank, also included repairs to irrigation works upstream so that more water reached the river mouth. The level of the northern sea rose faster than engineers had predicted, salinity fell, and fish such as pike-perch returned. Local fishing has restarted, and the shoreline has moved back towards the town of Aral." },
          { text: "The southern sea is a different story. Its eastern basin has dried out almost completely in some recent years, and there is no realistic plan to refill it. Attention has turned instead to reducing the harm caused by the exposed seabed. Since the early 2000s, and on a much larger scale in recent years, Uzbekistan has planted salt-tolerant shrubs such as saxaul across the dry bed. Their roots bind the soil and are intended to reduce the amount of dust carried by the wind. Critics point out that planting alone cannot bring back the sea, but supporters argue that it is the most practical step available while water use across the basin remains high." },
        ],
        groups: [
          {
            kind: "tfng",
            instructions: TF,
            items: [
              { n: 1, prompt: "Before the 1960s, the amount of water entering the Aral Sea was roughly equal to the amount that evaporated.", answer: ["TRUE"], expl: "Paragraph 1: 'Water flowing in roughly matched water lost to evaporation.'" },
              { n: 2, prompt: "Cotton was chosen because it could be grown with very little irrigation.", answer: ["FALSE"], expl: "Paragraph 2 says cotton is 'a crop that needs a great deal of water', the opposite of the statement." },
              { n: 3, prompt: "Most of the new irrigation canals were lined to prevent water loss.", answer: ["FALSE"], expl: "Paragraph 2: 'Many of these canals were unlined', so a large share of the water was lost." },
              { n: 4, prompt: "The southern part of the divided sea was larger than the northern part.", answer: ["TRUE"], expl: "Paragraph 3 describes 'a smaller northern sea' and 'a much larger southern sea'." },
              { n: 5, prompt: "Scientists have proved that dust from the seabed is the main cause of breathing problems in the region.", answer: ["FALSE"], expl: "Paragraph 4 says it is 'difficult to separate the effect of dust from other causes', so nothing has been proved." },
              { n: 6, prompt: "The Kokaral Dam was built by a company from outside Central Asia.", answer: ["NOT GIVEN"], expl: "The passage says Kazakhstan completed the dam with a World Bank loan but says nothing about which company built it." },
            ],
          },
          {
            kind: "gap",
            instructions: "Complete the notes below. Choose ONE WORD ONLY from the passage for each answer.",
            limit: "ONE WORD ONLY",
            title: "Recovery efforts",
            items: [
              { n: 7, prompt: "Northern sea: the dam prevents water from the Syr Darya flowing south, where it would ___", answer: ["evaporate"], expl: "Paragraph 5: water would flow 'into the larger basin, where it would simply evaporate'." },
              { n: 8, prompt: "The project also repaired ___ works further up the river.", answer: ["irrigation"], expl: "Paragraph 5: 'repairs to irrigation works upstream'." },
              { n: 9, prompt: "After the dam, the water level rose more quickly than ___ had expected.", answer: ["engineers"], expl: "Paragraph 5: 'rose faster than engineers had predicted'." },
              { n: 10, prompt: "Fish species such as ___ came back to the northern sea.", answer: ["pike-perch", "pikeperch"], expl: "Paragraph 5: 'fish such as pike-perch returned'." },
              { n: 11, prompt: "Southern sea: its ___ basin has sometimes dried out almost completely.", answer: ["eastern"], expl: "Paragraph 6: 'Its eastern basin has dried out almost completely in some recent years'." },
              { n: 12, prompt: "Uzbekistan has planted shrubs that can tolerate ___", answer: ["salt"], expl: "Paragraph 6: 'salt-tolerant shrubs such as saxaul'." },
              { n: 13, prompt: "The shrubs' ___ hold the soil together and should reduce wind-blown dust.", answer: ["roots"], expl: "Paragraph 6: 'Their roots bind the soil'." },
            ],
          },
        ],
      },
      {
        title: "Why teenagers sleep late",
        paragraphs: [
          { label: "A", text: "Parents around the world share a familiar complaint: teenagers stay up late at night and are almost impossible to wake in the morning. For a long time this was treated as a question of discipline, the result of screens, social life or simple laziness. Over the past few decades, however, sleep researchers have built up a different explanation. Their work suggests that the timing of sleep shifts during adolescence for biological reasons, and that much of the difficulty lies not in teenagers themselves but in the mismatch between their internal clocks and the timetable of school." },
          { label: "B", text: "The body's daily rhythm is controlled by a small group of cells in the brain that responds to light. In the evening, as light fades, the brain releases the hormone melatonin, which helps to prepare the body for sleep. Studies that measure melatonin in saliva have found that during puberty its evening release begins later than it did in childhood, often by one to two hours. As a result, a fifteen-year-old who goes to bed at the same time as a ten-year-old may lie awake simply because the body is not yet ready to sleep." },
          { label: "C", text: "A second process also changes. The longer a person stays awake, the stronger the pressure to sleep becomes, rather like a reservoir that slowly fills during the day. In younger children this pressure builds quickly, so they become tired early in the evening. In adolescents it appears to build more slowly, which makes it easier for them to remain alert late into the night. Neither change means that teenagers need less sleep; most researchers believe that they need around eight to ten hours, at least as much as younger children." },
          { label: "D", text: "Evening habits can make the problem worse. Bright screens deliver light at exactly the time when the brain is looking for signs of darkness, and messages and games keep the mind active. Yet researchers caution against blaming technology for everything. The shift in sleep timing was described before smartphones existed, and it has been observed in many different cultures, which suggests that its roots are largely biological. Screens appear to push an already late clock even later rather than create the delay on their own." },
          { label: "E", text: "Since teenagers cannot easily move their internal clocks, some education authorities have chosen to move the clock on the wall instead. A number of school districts have delayed the start of the school day, typically by thirty minutes to an hour. Studies of such changes have generally found that students sleep longer on school nights rather than simply going to bed later, and several have reported improvements in attendance and in the number of students arriving late. Evidence about examination results is more mixed, partly because grades depend on so many other factors." },
          { label: "F", text: "Later start times are not without difficulties. Bus timetables, sports training and the working hours of parents are all built around the existing timetable, and changing one part of the system affects all the others. Some families worry that a later finish will leave less time for part-time jobs or homework. For these reasons, researchers increasingly recommend combining later starts with education about sleep, so that students understand how light, routine and caffeine affect their rest." },
        ],
        groups: [
          {
            kind: "match",
            instructions: "The passage has six paragraphs, A–F. Choose the correct heading for each paragraph from the list of headings below.",
            options: [
              { key: "i", text: "Practical obstacles to a simple solution" },
              { key: "ii", text: "A hormone that arrives later" },
              { key: "iii", text: "Rethinking an everyday complaint" },
              { key: "iv", text: "Evidence that technology is the only cause" },
              { key: "v", text: "Changing the timetable rather than the student" },
              { key: "vi", text: "Why some cultures sleep more than others" },
              { key: "vii", text: "Tiredness that builds more slowly" },
              { key: "viii", text: "A factor that adds to an existing tendency" },
            ],
            items: [
              { n: 14, prompt: "Paragraph A", answer: ["iii"], expl: "A says late sleeping was once seen as discipline but researchers now explain it differently: the complaint is being rethought." },
              { n: 15, prompt: "Paragraph B", answer: ["ii"], expl: "B explains that melatonin release 'begins later' in puberty." },
              { n: 16, prompt: "Paragraph C", answer: ["vii"], expl: "C describes sleep pressure that 'appears to build more slowly' in adolescents." },
              { n: 17, prompt: "Paragraph D", answer: ["viii"], expl: "D says screens 'push an already late clock even later' — they add to a tendency rather than cause it, so heading iv is wrong." },
              { n: 18, prompt: "Paragraph E", answer: ["v"], expl: "E: authorities 'move the clock on the wall instead' by delaying school start times." },
              { n: 19, prompt: "Paragraph F", answer: ["i"], expl: "F lists buses, sports, parents' hours and jobs as difficulties with later start times." },
            ],
          },
          {
            kind: "mcq",
            instructions: "Choose the correct letter, A, B, C or D.",
            items: [
              { n: 20, prompt: "According to paragraph B, how do researchers measure the timing of melatonin release?", options: ["by recording brain activity during sleep", "by testing samples of saliva", "by asking teenagers when they feel tired", "by comparing bedtimes across age groups"], answer: ["B"], expl: "B: 'Studies that measure melatonin in saliva…'." },
              { n: 21, prompt: "What does the writer say about the amount of sleep teenagers need?", options: ["It is less than younger children need.", "It varies greatly between cultures.", "It is at least as much as younger children need.", "It has not yet been studied."], answer: ["C"], expl: "C: they need 'around eight to ten hours, at least as much as younger children'." },
              { n: 22, prompt: "Why do researchers think the shift in sleep timing is mainly biological?", options: ["It disappears when screens are removed.", "It was recorded before smartphones and in many cultures.", "It only affects students at early-starting schools.", "It can be measured with a blood test."], answer: ["B"], expl: "D: 'described before smartphones existed… observed in many different cultures'." },
              { n: 23, prompt: "What have studies of later school start times generally found?", options: ["Students go to bed later and sleep the same amount.", "Exam results improve in every case.", "Students sleep longer and attendance often improves.", "Parents strongly oppose the change."], answer: ["C"], expl: "E: students 'sleep longer on school nights' and attendance and punctuality improved; exam evidence is mixed." },
            ],
          },
          {
            kind: "gap",
            instructions: "Complete the summary below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
            limit: "NO MORE THAN TWO WORDS",
            title: "A combined approach",
            items: [
              { n: 24, prompt: "Changing school hours affects bus timetables, sports training and parents' ___", answer: ["working hours"], expl: "F: 'the working hours of parents'." },
              { n: 25, prompt: "Some families fear a later finish leaves less time for homework or ___", answer: ["part-time jobs", "part time jobs"], expl: "F: 'less time for part-time jobs or homework'." },
              { n: 26, prompt: "Researchers suggest teaching students how light, routine and ___ affect sleep.", answer: ["caffeine"], expl: "F: 'how light, routine and caffeine affect their rest'." },
            ],
          },
        ],
      },
      {
        title: "Naming colours",
        paragraphs: [
          { text: "Every language divides the continuous spectrum of colour into named categories, but not every language divides it in the same way. Some have only a handful of basic colour words; others, including English, have eleven or twelve. For much of the twentieth century, many linguists assumed that these differences were essentially arbitrary: each culture, they believed, cut up the spectrum according to its own history, with no deeper pattern to be found. I think this view, though understandable at the time, gave too little weight to what all humans have in common." },
          { text: "The assumption was challenged in 1969, when the anthropologist Brent Berlin and the linguist Paul Kay published a comparison of colour terms in a large number of languages. They argued that the categories were far from random. Languages with only two basic terms, they claimed, distinguish dark-cool shades from light-warm ones; a third term is almost always red; and later terms such as green, yellow and blue tend to appear in a broadly predictable order. They also found that speakers of very different languages chose similar 'best examples' of a colour, even when the boundaries of their categories differed." },
          { text: "Their work was not accepted without argument. Critics complained that much of the evidence came from dictionaries and from bilingual speakers living in cities, rather than from monolingual communities, and that the method encouraged researchers to find the pattern they were looking for. Later projects, which collected data directly from speakers of more than a hundred languages, refined the original sequence considerably. Even so, the central claim—that colour naming is shaped by universal constraints—has survived remarkably well. In my view, this is one of the more impressive cases in which a bold early hypothesis has been corrected in detail but confirmed in outline." },
          { text: "A separate question is whether the words we have change what we actually see. Russian, for example, has two basic terms for what English speakers call blue: one for lighter shades and one for darker ones. In laboratory experiments, Russian speakers have been slightly faster at telling apart two blues that fall on opposite sides of their boundary than two blues from the same side, an advantage not shown by English speakers. Interestingly, the advantage tends to disappear when participants are asked to repeat a string of numbers at the same time, which suggests that it depends on silently using language during the task." },
          { text: "Results like this are sometimes reported as proof that language determines perception, but that is an exaggeration. The effects are small, measured in fractions of a second, and they do not show that English speakers cannot see the difference between light and dark blue—they plainly can. What the experiments suggest is something more modest: that the categories of our language can make certain distinctions quicker or easier to notice. That seems to me a more interesting finding than the dramatic version, precisely because it is believable." },
          { text: "Why should languages differ at all if colour perception is largely shared? One answer is need. Communities in which dyes, paints and manufactured objects are common have more reasons to talk about colour precisely, whereas in other settings it may be more useful to describe things by texture, brightness or what they resemble. Recent studies using computer models have found that colour vocabularies across languages are close to the most efficient way of dividing the spectrum for a given number of words. If this is right, the variety we observe is not a sign of arbitrariness but of different communities solving the same problem with different resources." },
        ],
        groups: [
          {
            kind: "ynng",
            instructions: YN,
            items: [
              { n: 27, prompt: "Earlier linguists placed too much emphasis on what all humans share.", answer: ["NO"], expl: "Paragraph 1: the writer says that view gave 'too little weight to what all humans have in common' — the opposite." },
              { n: 28, prompt: "Berlin and Kay's main idea has largely stood the test of time.", answer: ["YES"], expl: "Paragraph 3: the central claim 'has survived remarkably well… confirmed in outline'." },
              { n: 29, prompt: "Experiments show English speakers cannot distinguish light blue from dark blue.", answer: ["NO"], expl: "Paragraph 5: 'they plainly can'." },
              { n: 30, prompt: "The modest interpretation of the Russian blue experiments is more convincing than the dramatic one.", answer: ["YES"], expl: "Paragraph 5: the modest finding is 'more interesting… precisely because it is believable'." },
              { n: 31, prompt: "Colour research should receive more government funding.", answer: ["NOT GIVEN"], expl: "The writer never discusses funding." },
            ],
          },
          {
            kind: "mcq",
            instructions: "Choose the correct letter, A, B, C or D.",
            items: [
              { n: 32, prompt: "According to Berlin and Kay, a language with three basic colour terms will usually have a word for", options: ["blue.", "green.", "red.", "yellow."], answer: ["C"], expl: "Paragraph 2: 'a third term is almost always red'." },
              { n: 33, prompt: "What criticism was made of Berlin and Kay's original study?", options: ["It included too few languages.", "It relied heavily on dictionaries and city-dwelling bilinguals.", "It ignored the colour red.", "It was based only on computer models."], answer: ["B"], expl: "Paragraph 3: evidence came 'from dictionaries and from bilingual speakers living in cities'." },
              { n: 34, prompt: "What happened when Russian speakers repeated numbers during the colour task?", options: ["Their advantage tended to disappear.", "They became faster than before.", "They named more shades of blue.", "They made more mistakes with green."], answer: ["A"], expl: "Paragraph 4: 'the advantage tends to disappear when participants are asked to repeat a string of numbers'." },
              { n: 35, prompt: "What do the computer-model studies in the last paragraph suggest?", options: ["Colour words are chosen at random.", "Languages with more words are more efficient.", "Colour vocabularies divide the spectrum close to optimally for their size.", "Manufactured objects reduce the need for colour words."], answer: ["C"], expl: "Paragraph 6: vocabularies are 'close to the most efficient way of dividing the spectrum for a given number of words'." },
            ],
          },
          {
            kind: "match",
            instructions: "Complete each sentence with the correct ending, A–G.",
            options: [
              { key: "A", text: "may have more reason to name colours precisely." },
              { key: "B", text: "chose similar best examples of colours." },
              { key: "C", text: "changed the original sequence in important ways." },
              { key: "D", text: "can only see two or three colours." },
              { key: "E", text: "were slightly quicker to separate two blues across their boundary." },
              { key: "F", text: "proved that perception is fixed at birth." },
              { key: "G", text: "described the differences between languages as arbitrary." },
            ],
            items: [
              { n: 36, prompt: "Many twentieth-century linguists", answer: ["G"], expl: "Paragraph 1: they assumed the differences were 'essentially arbitrary'." },
              { n: 37, prompt: "Speakers of very different languages", answer: ["B"], expl: "Paragraph 2: they 'chose similar \"best examples\" of a colour'." },
              { n: 38, prompt: "Later projects with over a hundred languages", answer: ["C"], expl: "Paragraph 3: they 'refined the original sequence considerably'." },
              { n: 39, prompt: "In the laboratory, Russian speakers", answer: ["E"], expl: "Paragraph 4: 'slightly faster at telling apart two blues that fall on opposite sides of their boundary'." },
              { n: 40, prompt: "Communities where dyes and manufactured objects are common", answer: ["A"], expl: "Paragraph 6: they 'have more reasons to talk about colour precisely'." },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "ielts-reading-2",
    title: "Reading test 2",
    passages: [
      {
        title: "Paper on the move",
        paragraphs: [
          { text: "Chinese historical records credit an official of the Han court named Cai Lun with presenting a new writing material to the emperor in the year 105 CE. Archaeologists have since found fragments of paper that appear to be older, so Cai Lun was probably an improver and promoter rather than the original inventor. What is not in doubt is that by his time the Chinese had learned to beat plant fibres, such as tree bark, hemp and old fishing nets, into a pulp, spread it across a screen and let it dry into thin sheets. Compared with bamboo strips, which were heavy, or silk, which was expensive, paper was light and cheap." },
          { text: "For several centuries the technique remained largely within China and neighbouring regions. A well-known story places its arrival in the Islamic world in Samarkand after the Battle of Talas in 751, when Chinese prisoners are said to have taught local craftsmen how to make it. Historians now treat this account with some caution, since paper may have been reaching Central Asia along trade routes before the battle. Either way, Samarkand became famous for its paper, and the material spread quickly through the cities of the Abbasid Caliphate. A paper mill is recorded in Baghdad by the end of the eighth century." },
          { text: "Paper makers in the Islamic world adapted the process to local materials. Instead of bark, they relied heavily on linen rags, which were plentiful and produced a strong, smooth sheet. They also coated the surface with starch so that ink would not spread. The new material transformed administration: government offices could keep larger archives, and copies of books became far cheaper to produce. Libraries in cities such as Baghdad and Cairo are reported to have held very large collections, although the figures given in medieval sources are difficult to verify." },
          { text: "From North Africa and Spain, paper making reached Christian Europe. One of the earliest European mills was established at Xàtiva in Spain in the twelfth century, and Italian towns became important centres in the following hundred years. Italian makers introduced water-powered hammers to beat the rags, which saved a great deal of labour, and they began pressing designs called watermarks into their sheets to identify the mill. When printing with movable type spread in Europe in the second half of the fifteenth century, it created enormous new demand, because a single print run could use thousands of sheets." },
          { text: "The demand eventually caused a shortage of rags. By the early nineteenth century, paper makers were searching for alternatives and experimenting with straw and other plants. The solution that finally succeeded was wood. In the 1840s inventors in Germany and Canada independently developed methods of grinding wood into pulp, and chemical processes followed later in the century. Wood pulp made paper cheap enough for mass-circulation newspapers, but it had a drawback: early wood-pulp paper was acidic, and many books printed between about 1850 and 1950 are now turning brown and brittle." },
          { text: "Today, librarians use several methods to slow this decay, including treating whole books with alkaline solutions. Meanwhile, the industry has changed again. Much modern paper contains recycled fibre, and acid-free paper is now standard for documents that need to last. It is an unexpected end to a journey that began with old fishing nets: a material once valued because it was cheap is now increasingly made with long-term survival in mind." },
        ],
        groups: [
          {
            kind: "tfng",
            instructions: TF,
            items: [
              { n: 1, prompt: "Cai Lun was definitely the first person to make paper.", answer: ["FALSE"], expl: "Paragraph 1: older fragments exist, so he 'was probably an improver and promoter rather than the original inventor'." },
              { n: 2, prompt: "Early Chinese paper was cheaper than silk.", answer: ["TRUE"], expl: "Paragraph 1: silk 'was expensive', paper 'was light and cheap'." },
              { n: 3, prompt: "All historians accept the story about Chinese prisoners at Talas.", answer: ["FALSE"], expl: "Paragraph 2: 'Historians now treat this account with some caution'." },
              { n: 4, prompt: "Samarkand paper was exported to China.", answer: ["NOT GIVEN"], expl: "The passage says Samarkand became famous for paper but not that it was sold to China." },
              { n: 5, prompt: "Paper makers in the Islamic world coated their sheets with starch.", answer: ["TRUE"], expl: "Paragraph 3: 'They also coated the surface with starch'." },
              { n: 6, prompt: "The sizes of medieval libraries in Baghdad and Cairo are known precisely.", answer: ["FALSE"], expl: "Paragraph 3: the figures 'are difficult to verify'." },
              { n: 7, prompt: "Watermarks were first used in Spain.", answer: ["NOT GIVEN"], expl: "Paragraph 4 says Italian makers pressed watermarks; it does not say where they were first used, and nothing about Spain using them." },
            ],
          },
          {
            kind: "gap",
            instructions: "Complete the table below. Choose ONE WORD ONLY from the passage for each answer.",
            limit: "ONE WORD ONLY",
            title: "How paper changed",
            items: [
              { n: 8, prompt: "Islamic world — main raw material: linen ___", answer: ["rags"], expl: "Paragraph 3: 'they relied heavily on linen rags'." },
              { n: 9, prompt: "Italy — rags beaten by hammers driven by ___ power", answer: ["water"], expl: "Paragraph 4: 'water-powered hammers'." },
              { n: 10, prompt: "Fifteenth century — demand rose with the spread of ___", answer: ["printing"], expl: "Paragraph 4: 'When printing with movable type spread…'." },
              { n: 11, prompt: "Nineteenth century — rags replaced by ___", answer: ["wood"], expl: "Paragraph 5: 'The solution that finally succeeded was wood'." },
              { n: 12, prompt: "Problem with early wood-pulp paper: it was ___", answer: ["acidic"], expl: "Paragraph 5: 'early wood-pulp paper was acidic'." },
              { n: 13, prompt: "Libraries treat whole books with ___ solutions", answer: ["alkaline"], expl: "Paragraph 6: 'treating whole books with alkaline solutions'." },
            ],
          },
        ],
      },
      {
        title: "Turning seawater into drinking water",
        paragraphs: [
          { label: "A", text: "Almost all of the water on Earth is in the oceans, and most of the rest is locked in ice. It is not surprising, then, that countries facing water shortages have long been attracted by the idea of removing salt from seawater. Desalination plants now operate in more than a hundred countries, from the Gulf states and North Africa to Australia, Spain and the western United States. In some places they supply the majority of household drinking water." },
          { label: "B", text: "The oldest large-scale method is thermal: seawater is heated until it evaporates, and the vapour is condensed as fresh water, leaving the salt behind. This works reliably but uses a great deal of energy, which is why early plants were mostly built in oil-rich countries where fuel was cheap. Since the 1990s, most new plants have instead used reverse osmosis. In this process, seawater is pushed at high pressure through membranes with pores so small that water molecules can pass but most salt cannot." },
          { label: "C", text: "Reverse osmosis still requires energy, mainly to run the pumps, but far less than boiling water. Engineers have reduced the figure further with devices that recover pressure from the concentrated water leaving the membranes and use it to help pressurise the incoming flow. As a result, the energy needed to produce a cubic metre of fresh water has fallen dramatically since the 1970s, and it is now close to the minimum that physics allows for the process. Further large savings are therefore unlikely to come from the membranes themselves." },
          { label: "D", text: "The biggest environmental concern is not energy but brine. For every litre of fresh water produced, a plant typically discharges more than a litre of concentrated salt water, often containing chemicals used to clean the membranes. If it is released carelessly, the dense brine can sink and spread along the sea floor, harming organisms that live there. Well-designed outlets use diffusers that mix the brine quickly with surrounding water, and some researchers are investigating ways to extract useful minerals from it." },
          { label: "E", text: "Cost is another limit. Although prices have fallen, desalinated water usually remains more expensive than water from rivers or underground sources, and it must often be pumped a long way inland and uphill. For this reason it is mostly used by coastal cities rather than for agriculture, which needs very large volumes of cheap water. A farmer growing grain cannot normally afford to irrigate a field with water from a desalination plant." },
          { label: "F", text: "Supporters argue that desalination provides security, because it does not depend on rainfall. During droughts, cities with plants can continue to supply homes even when reservoirs are low. Critics reply that the same money could often achieve more if it were spent on repairing leaking pipes, reusing treated wastewater or encouraging people to use less. Most water planners now see these options as complementary: desalination is one source among several, not a substitute for using water carefully." },
        ],
        groups: [
          {
            kind: "match",
            instructions: "The passage has six paragraphs, A–F. Which paragraph contains the following information?",
            options: [
              { key: "A", text: "Paragraph A" },
              { key: "B", text: "Paragraph B" },
              { key: "C", text: "Paragraph C" },
              { key: "D", text: "Paragraph D" },
              { key: "E", text: "Paragraph E" },
              { key: "F", text: "Paragraph F" },
            ],
            items: [
              { n: 14, prompt: "a reason why desalinated water is rarely used to grow crops", answer: ["E"], expl: "E: agriculture 'needs very large volumes of cheap water'." },
              { n: 15, prompt: "a method of reusing energy within the process", answer: ["C"], expl: "C: devices 'recover pressure from the concentrated water'." },
              { n: 16, prompt: "an explanation of where early plants were located", answer: ["B"], expl: "B: early plants were built 'in oil-rich countries where fuel was cheap'." },
              { n: 17, prompt: "alternatives that might be a better use of money", answer: ["F"], expl: "F: repairing pipes, reusing wastewater, using less." },
              { n: 18, prompt: "a possible commercial use for a waste product", answer: ["D"], expl: "D: 'ways to extract useful minerals from it' (the brine)." },
            ],
          },
          {
            kind: "mcq",
            instructions: "Choose the correct letter, A, B, C or D.",
            items: [
              { n: 19, prompt: "How does reverse osmosis separate salt from water?", options: ["by heating the water until it boils", "by pushing water through very fine membranes", "by adding chemicals that remove salt", "by freezing the water"], answer: ["B"], expl: "B: water 'is pushed at high pressure through membranes'." },
              { n: 20, prompt: "Why does the writer say further large energy savings are unlikely from membranes?", options: ["Membranes are too expensive to replace.", "Energy use is already close to the physical minimum.", "Pumps cannot be made more efficient.", "Engineers have stopped researching them."], answer: ["B"], expl: "C: energy use 'is now close to the minimum that physics allows'." },
              { n: 21, prompt: "What can happen if brine is released carelessly?", options: ["It rises and evaporates.", "It spreads along the sea floor and harms organisms.", "It makes nearby beaches unsafe for swimmers.", "It is absorbed by underground water."], answer: ["B"], expl: "D: dense brine 'can sink and spread along the sea floor, harming organisms'." },
              { n: 22, prompt: "What view do most water planners now hold?", options: ["Desalination should replace other sources.", "Desalination is too expensive to use.", "Desalination should be combined with other measures.", "Desalination is only useful during droughts."], answer: ["C"], expl: "F: options are 'complementary… one source among several'." },
            ],
          },
          {
            kind: "gap",
            instructions: "Complete the sentences below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
            limit: "NO MORE THAN TWO WORDS",
            items: [
              { n: 23, prompt: "Desalination plants are found in over ___ countries.", answer: ["a hundred", "one hundred", "100"], expl: "A: 'more than a hundred countries'." },
              { n: 24, prompt: "Modern outlets use ___ to mix brine quickly with seawater.", answer: ["diffusers"], expl: "D: 'outlets use diffusers'." },
              { n: 25, prompt: "Desalinated water often has to be pumped inland and ___", answer: ["uphill"], expl: "E: 'pumped a long way inland and uphill'." },
              { n: 26, prompt: "Supporters say desalination gives security because it does not rely on ___", answer: ["rainfall"], expl: "F: 'it does not depend on rainfall'." },
            ],
          },
        ],
      },
      {
        title: "Is more choice always better?",
        paragraphs: [
          { text: "Modern shoppers are rarely short of options. A supermarket may stock dozens of kinds of breakfast cereal, and an online shop can offer thousands of variations of a single product. Economists have traditionally assumed that such abundance is good: a person who does not want an extra option can simply ignore it, so more choice can never make anyone worse off. Around the turn of the century, however, a series of psychology experiments appeared to challenge this assumption, and the idea of 'choice overload' quickly became popular far beyond universities." },
          { text: "The most famous study was carried out in a food shop in California. On some days, researchers set up a tasting stand with twenty-four flavours of jam; on others, the stand displayed only six. The larger display attracted more visitors, but shoppers who had seen the small display were far more likely to go on and buy a jar. Related experiments with chocolates and essay topics produced similar results. Together, these studies suggested that a large set of options can be appealing at first but discouraging when the time comes to decide." },
          { text: "The jam study has been described in countless books, talks and business articles, often as if it showed that people always prefer fewer options. That is a misreading. The researchers themselves were careful to describe particular conditions, and in my view the popular version of their work has done it a disservice. A finding about one stand in one shop on a few days became a general law of human behaviour, which is a great deal more than a single experiment can support." },
          { text: "Later research made the picture more complicated. When psychologists combined the results of dozens of choice-overload experiments in a statistical review, the average effect turned out to be close to zero: in some studies more options discouraged people, in others they helped, and in many they made no difference. This does not mean the original results were wrong. Rather, it suggests that choice overload occurs only under certain conditions, and that the important question is not whether it exists but when." },
          { text: "Subsequent work has identified several of those conditions. Large sets of options are most discouraging when the choices are hard to compare, when people do not already know what they prefer, when they are under time pressure, and when the decision feels important. By contrast, a shopper who knows exactly what she wants, or who can sort options by a single clear feature such as price, is unlikely to be troubled by a long list. It seems to me that this more detailed account is far more useful to anyone designing a shop, a website or a public service than the simple slogan it replaced." },
          { text: "There is a lesson here about how scientific findings travel. Striking results are easy to remember and pleasant to repeat, and the qualifications attached to them tend to fall away. The story of the jam experiment does not show that psychology is unreliable; on the contrary, the later studies are an example of the field correcting itself. But it does show why a single memorable experiment should be treated as the beginning of an investigation rather than its conclusion." },
        ],
        groups: [
          {
            kind: "ynng",
            instructions: YN,
            items: [
              { n: 27, prompt: "The popular retelling of the jam study has misrepresented it.", answer: ["YES"], expl: "Paragraph 3: 'That is a misreading… the popular version of their work has done it a disservice'." },
              { n: 28, prompt: "The original jam researchers overstated their own findings.", answer: ["NO"], expl: "Paragraph 3: 'The researchers themselves were careful to describe particular conditions'." },
              { n: 29, prompt: "The detailed account of when choice overload occurs is more useful than the original slogan.", answer: ["YES"], expl: "Paragraph 5: 'this more detailed account is far more useful… than the simple slogan'." },
              { n: 30, prompt: "Online shops should reduce the number of products they offer.", answer: ["NOT GIVEN"], expl: "The writer does not recommend this for online shops." },
              { n: 31, prompt: "The history of the jam study proves that psychology cannot be trusted.", answer: ["NO"], expl: "Paragraph 6: it 'does not show that psychology is unreliable'." },
            ],
          },
          {
            kind: "mcq",
            instructions: "Choose the correct letter, A, B, C or D.",
            items: [
              { n: 32, prompt: "What did economists traditionally assume about extra options?", options: ["They confuse most shoppers.", "They cannot make anyone worse off.", "They increase prices.", "They are only useful online."], answer: ["B"], expl: "Paragraph 1: 'more choice can never make anyone worse off'." },
              { n: 33, prompt: "In the jam study, the display with twenty-four flavours", options: ["attracted more visitors.", "led to more purchases.", "was only used once.", "offered free jars."], answer: ["A"], expl: "Paragraph 2: 'The larger display attracted more visitors'." },
              { n: 34, prompt: "What did the statistical review of many experiments find?", options: ["Choice overload occurs in every study.", "The original jam study was faked.", "On average, the effect was close to zero.", "More options always help."], answer: ["C"], expl: "Paragraph 4: 'the average effect turned out to be close to zero'." },
              { n: 35, prompt: "Which shopper is LEAST likely to be affected by a long list of options?", options: ["one under time pressure", "one who can sort options by price", "one making an important decision", "one who is unsure what she likes"], answer: ["B"], expl: "Paragraph 5: someone who 'can sort options by a single clear feature such as price' is unlikely to be troubled." },
            ],
          },
          {
            kind: "gap",
            instructions: "Complete the summary below. Choose ONE WORD ONLY from the passage for each answer.",
            limit: "ONE WORD ONLY",
            title: "How findings travel",
            items: [
              { n: 36, prompt: "Results that are ___ are easy to remember and repeat.", answer: ["striking"], expl: "Paragraph 6: 'Striking results are easy to remember'." },
              { n: 37, prompt: "The ___ attached to findings tend to be forgotten.", answer: ["qualifications"], expl: "Paragraph 6: 'the qualifications attached to them tend to fall away'." },
              { n: 38, prompt: "Later studies show the field ___ itself.", answer: ["correcting"], expl: "Paragraph 6: 'an example of the field correcting itself'." },
              { n: 39, prompt: "A memorable experiment should be seen as the ___ of an investigation.", answer: ["beginning"], expl: "Paragraph 6: 'the beginning of an investigation rather than its conclusion'." },
              { n: 40, prompt: "…and not as its ___", answer: ["conclusion"], expl: "Paragraph 6: 'rather than its conclusion'." },
            ],
          },
        ],
      },
    ],
  },
];
