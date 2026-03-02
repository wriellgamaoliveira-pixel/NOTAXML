// worker.js (classic) - versão robusta (sem libs de XML)
// Usa: fflate para unzip + regex para extrair tags

importScripts("https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js");

function toNum(s) {
  const n = parseFloat(String(s ?? "0").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function sumTag(xmlText, tag) {
  // soma todas ocorrências: <tag>valor</tag>
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`, "g");
  let m, sum = 0;
  while ((m = re.exec(xmlText)) !== null) sum += toNum(m[1]);
  return sum;
}

function firstTag(xmlText, tag) {
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`);
  const m = xmlText.match(re);
  return m ? String(m[1]).trim() : "";
}

function getCSTICMS(xmlText) {
  // prioridade: CSOSN (Simples) -> CST
  const csosn = firstTag(xmlText, "CSOSN");
  if (csosn) return `CSOSN ${csosn}`;
  const cst = firstTag(xmlText, "CST");
  if (cst) return `CST ${cst}`;
  return "CST 000";
}

function getCFOP(xmlText) {
  return firstTag(xmlText, "CFOP") || "0000";
}

function postStage(stage, message, percent, processed, total) {
  self.postMessage({ type: "stage", stage, message, percent, processed, total });
}

function postProgress(stage, processed, total) {
  const percent = total ? Math.round((processed / total) * 100) : 100;
  self.postMessage({ type: "progress", stage, percent, processed, total });
}

self.onmessage = async (event) => {
  try {
    const { zipBuffer } = event.data || {};
    if (!zipBuffer) throw new Error("ZIP inválido.");

    postStage("unzip", "Descompactando ZIP...", 2, 0, "-");

    const zipData = new Uint8Array(zipBuffer);
    const unzipped = fflate.unzipSync(zipData);

    postStage("scan", "Listando arquivos XML...", 5, 0, "-");

    const names = Object.keys(unzipped).filter(n => n.toLowerCase().endsWith(".xml"));
    const total = names.length;

    if (!total) {
      throw new Error("Nenhum arquivo .xml encontrado dentro do ZIP.");
    }

    const resumo = {
      total_xml: 0,
      total_valor_itens: 0,
      por_cst_cfop: {},
      impostos: { ICMS: 0, PIS: 0, COFINS: 0 }
    };

    postStage("parse", "Processando XMLs...", 8, 0, total);

    let processed = 0;

    // manda progresso com frequência (inclusive em ZIP pequeno)
    const BATCH = 1;

    for (const name of names) {
      const xmlText = new TextDecoder().decode(unzipped[name]);

      // IMPORTANTÍSSIMO:
      // vProd aparece em itens e totais; aqui somamos todos vProd encontrados no XML
      // (se depois você quiser “somar só itens”, eu ajusto)
      const vProd = sumTag(xmlText, "vProd");
      const vICMS = sumTag(xmlText, "vICMS");
      const vPIS = sumTag(xmlText, "vPIS");
      const vCOFINS = sumTag(xmlText, "vCOFINS");

      resumo.total_valor_itens += vProd;
      resumo.impostos.ICMS += vICMS;
      resumo.impostos.PIS += vPIS;
      resumo.impostos.COFINS += vCOFINS;

      const cst = getCSTICMS(xmlText);
      const cfop = getCFOP(xmlText);
      const key = `${cst}__${cfop}`;

      if (!resumo.por_cst_cfop[key]) {
        resumo.por_cst_cfop[key] = { cst, cfop, qtd_xml: 0, valor_itens: 0 };
      }
      resumo.por_cst_cfop[key].qtd_xml += 1;
      resumo.por_cst_cfop[key].valor_itens += vProd;

      resumo.total_xml += 1;
      processed += 1;

      if (processed % BATCH === 0 || processed === total) {
        postProgress("parse", processed, total);
      }
    }

    self.postMessage({ type: "done", result: resumo, total });
  } catch (err) {
    self.postMessage({ type: "error", error: err?.message || String(err) });
  }
};
