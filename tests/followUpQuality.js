"use strict";
const assert = require("node:assert/strict");
const { generateFollowUpQuestions: generate, comparisonKey, relatedConcepts, resolveSubjectType } = require("../brain/contentStructurer");
const input = (topic, text, extra = []) => ({ topic, articles: [{ title: topic, text }, ...extra] });
const cases = [
  ["Mustafa Kemal Atatürk", "Mustafa Kemal Atatürk, devlet adamı ve yazardır. Kurtuluş savaşı döneminde görev almıştır.", "HISTORY", "PERSON"],
  ["Ada Lovelace", "Ada Lovelace, matematikçi ve yazardır. Bilgisayar araştırmalarındaki çalışmalarıyla tanınır.", "TECHNOLOGY", "PERSON"],
  ["Adana", "Adana, Türkiye'de bir şehirdir. Kentin tarihi ve coğrafi özellikleri araştırılmaktadır.", "PLACE", "PLACE"],
  ["İzmir", "İzmir, Türkiye'de bir kenttir. Bölgede farklı tarihi yerleşimler bulunmaktadır.", "PLACE", "PLACE"],
  ["Yapay Zekâ", "Yapay zekâ, öğrenme ve problem çözme görevleri gerçekleştiren sistemleri inceler.", "TECHNOLOGY", "TECHNOLOGY"],
  ["Mars", "Mars, Güneş Sistemi'nin dördüncü gezegenidir. Yüzeyi araştırma araçlarıyla incelenir.", "SPACE", "SPACE"],
  ["Fotosentez", "Fotosentez, ışık enerjisinin kimyasal enerjiye dönüştürüldüğü biyolojik süreçtir.", "SCIENCE", "SCIENCE"],
  ["Sanayi Devrimi", "Sanayi Devrimi, üretim yöntemlerinde köklü değişimlerin yaşandığı tarihsel süreçtir.", "HISTORY", "HISTORY"]
];
for (const [topic, text, subjectType, expected] of cases) {
  const value = input(topic, text);
  const context = { intent: "GENERAL", subjectType };
  assert.equal(resolveSubjectType(value, context), expected);
  const questions = generate(value, context);
  assert.equal(questions.length, 3);
  assert.equal(new Set(questions.map(comparisonKey)).size, questions.length);
  assert.ok(questions.every(q => q.endsWith("?")));
  assert.ok(questions.every(q => !q.includes("arasındaki ilişki")));
  if (expected === "PERSON") assert.ok(questions.every(q => !/nedir|nasıl çalışır/.test(q)));
  if (expected === "PLACE") assert.ok(questions.every(q => !/oluşur|çalışır/.test(q)));
  if (expected === "TECHNOLOGY") assert.ok(questions.some(q => q.includes("nasıl çalışır")));
}
for (const [topic, fragment] of [["Mars", "mars"], ["Adana", "ADANA"], ["Yapay Zekâ", "yapay"], ["Yapay Zekâ", "YAPAY,  ZEKA"], ["Işık Bilimi", "ışık"], ["Mustafa Kemal Atatürk", "savaşı"]]) {
  const value = input(topic, `${topic}, araştırmalara konu olan önemli bir konudur.`, [{ title: fragment, text: `${fragment} hakkında yeterli uzunlukta ama bağımsız bir kavram oluşturmayan kaynak cümlesi bulunmaktadır.` }]);
  assert.deepEqual(relatedConcepts(value, topic), []);
  const questions = generate(value, { subjectType: topic.includes("Atatürk") ? "PERSON" : "GENERAL" });
  for (const bad of ["mars ile Mars arasındaki ilişki nedir?", "adana ile Adana arasındaki ilişki nedir?", "yapay ile Yapay Zekâ arasındaki ilişki nedir?", "Mustafa Kemal Atatürk nedir?", "savaşı ile Mustafa Kemal Atatürk arasındaki ilişki nedir?"]) assert.ok(!questions.includes(bad));
}
assert.equal(comparisonKey("  YAPAY—ZEKÂ! "), comparisonKey("yapay zeka"));
assert.deepEqual(relatedConcepts(input("Enerji", "Enerji fiziksel sistemlerde incelenir.", [{ title: "Isı aktarımı", text: "Isı aktarımı, sıcaklık farkı bulunan sistemler arasında enerjinin taşınması sürecidir." }]), "Enerji"), ["Isı aktarımı"]);
assert.deepEqual(generate(input("Boş", "")), []);
// The final selected article must replace stale follow-ups on every response surface.
const finalized = require("../brain/researchQuality").finalize({
  articles: [{ title: "Örnek Kişi", text: "Örnek Kişi, bir matematikçi ve yazardır. Çalışmaları matematik tarihinde incelenmektedir.", url: "https://example.org/person" }],
  followUpQuestions: ["stale"], brain: { followUpQuestions: ["stale"] }, ai: { followUpQuestions: ["stale"] }
}, { query: "Örnek Kişi", intent: "GENERAL", expansions: [] });
assert.equal(finalized.followUpQuestions.length, 3);
assert.deepEqual(finalized.followUpQuestions, finalized.structuredContent.followUpQuestions);
assert.deepEqual(finalized.brain.followUpQuestions, finalized.followUpQuestions);
assert.deepEqual(finalized.ai.followUpQuestions, finalized.followUpQuestions);
assert.ok(finalized.followUpQuestions.every(q => !q.endsWith("nedir?")));
const visualResult = require("../brain/researchQuality").finalize({
  articles: [{ title: "Örnek teknoloji", text: "Örnek teknoloji, bilgisayar sistemlerinde kullanılan bir yöntemdir.", url: "https://example.org/technology" }],
  images: [{ title: "Örnek teknoloji algoritma şeması", image: "https://example.org/diagram.png" }, { title: "Örnek teknoloji eylem planı", image: "https://example.org/promotion.png" }]
}, { query: "Örnek teknoloji", intent: "TECHNOLOGY", expansions: [] });
assert.deepEqual(visualResult.images.map(i => i.image), ["https://example.org/diagram.png"]);
console.log("PASS generic follow-up quality: person, place, technology, astronomy, biology, history, normalization, fragments, context and duplicates");
