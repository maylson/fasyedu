import fs from "node:fs";
import path from "node:path";

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error("Uso: node scripts/normalize-json-ptbr.mjs <arquivo1.json> [arquivo2.json...]");
  process.exit(1);
}

const replacements = [
  ["Hor?rio", "Horário"],
  ["Ter?a-feira", "Terça-feira"],
  ["Audi??o", "Audição"],
  ["Alfabetiza??o", "Alfabetização"],
  ["Cient?fico", "Científico"],
  ["Matem?tico", "Matemático"],
  ["Liter?rio", "Literário"],
  ["Ci?ncias", "Ciências"],
  ["Horário", "Horário"],
  ["Terça-feira", "Terça-feira"],
  ["Audição", "Audição"],
  ["Alfabetização", "Alfabetização"],
  ["Científico", "Científico"],
  ["Matemático", "Matemático"],
  ["Literário", "Literário"],
  ["Ciências", "Ciências"],
  ["Portugues", "Português"],
  ["Lingua Portuguesa", "Língua Portuguesa"],
];

let changed = 0;

for (const target of targets) {
  const resolved = path.resolve(target);
  const original = fs.readFileSync(resolved, "utf8");
  let next = original;

  for (const [bad, good] of replacements) {
    next = next.split(bad).join(good);
  }

  if (next !== original) {
    fs.writeFileSync(resolved, next, "utf8");
    changed += 1;
    console.log(`Corrigido: ${resolved}`);
  } else {
    console.log(`Sem ajuste: ${resolved}`);
  }
}

console.log(`Arquivos alterados: ${changed}/${targets.length}`);
