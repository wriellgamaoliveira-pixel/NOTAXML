// worker.js (classic)
importScripts("https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js");
importScripts("https://cdn.jsdelivr.net/npm/fast-xml-parser@4.4.1/dist/fxp.min.js");

const { XMLParser } = fxp;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
});

function toNum(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// soma profunda por chave
function sumAllByKey(obj, key) {
  let sum = 0;
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    for (const k of Object.keys(cur)) {
      const val = cur[k];
      if (k === key) {
        if (Array.isArray(val)) sum += val.reduce((a, b) => a + toNum(b), 0);
        else sum += toNum(val);
      } else if (val && typeof val === "object") {
        stack.push(val);
      }
    }
  }
  return sum;
}

function getFirstByKeys(json, keys) {
  const stack = [json];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    for (const k of Object.keys(cur)) {
      const v = cur[k];
      if (keys.includes(k)) return String(v ?? "").trim();
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return "";
}

function getCFOP(json) {
  return getFirstByKeys(json, ["CFOP", "cfop"]) || "0000";
}

function getCSTICMS(json) {
  const csosn = getFirstByKeys(json, ["CSOSN"]);
  if (csosn) return `CSOSN ${csosn}`;
  const cst = getFirstByKeys(json, ["CST"]);
  if (cst) return `CST ${cst}`;
  return "CST 000";
}

function postStage(stage, message, percent, processed, total) {
  self.postMessage({ type: "stage", stage, message, percent, processed, total });
}

function sleep0() {
  return new Promise((r) => setTimeout(r, 0));
}

self.onmessage = async (event) => {
  try {
    const { zipBuffer } = event.data || {};
    if (!zipBuffer) throw new Error("ZIP inválido.");

    postStage("unzip", "Descompactando ZIP...", 2, 0, "-");

    const zipData = new Uint8Array(zipBuffer);
    const unzipped = fflate.unzipSync(zipData);

    postStage("scan", "Listando XMLs...", 5, 0, "-");

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

    let processed = 0;

    // lote para não “parecer travado”
    const BATCH = 30;

    postStage("parse", "Iniciando leitura dos XMLs...", 8, 0, total);

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const xmlText = new TextDecoder().decode(unzipped[name]);
      const json = parser.parse(xmlText);

      const vProd = sumAllByKey(json, "vProd");
      const vICMS = sumAllByKey(json, "vICMS");
      const vPIS = sumAllByKey(json, "vPIS");
      const vCOFINS = sumAllByKey(json, "vCOFINS");

      resumo.total_valor_itens += vProd;
      resumo.impostos.ICMS += vICMS;
      resumo.impostos.PIS += vPIS;
      resumo.impostos.COFINS += vCOFINS;

      const cst = getCSTICMS(json);
      const cfop = getCFOP(json);
      const key = `${cst}__${cfop}`;

      if (!resumo.por_cst_cfop[key]) {
        resumo.por_cst_cfop[key] = { cst, cfop, qtd_xml: 0, valor_itens: 0 };
      }
      resumo.por_cst_cfop[key].qtd_xml += 1;
      resumo.por_cst_cfop[key].valor_itens += vProd;

      resumo.total_xml += 1;
      processed += 1;

      // manda progresso por lote
      if (processed % BATCH === 0 || processed === total) {
        const percent = Math.max(10, Math.round((processed / total) * 100));
        self.postMessage({ type: "progress", stage: "parse", percent, processed, total });
        await sleep0(); // devolve tempo ao navegador e mantém “vivo”
      }
    }

    self.postMessage({ type: "done", result: resumo, total });
  } catch (err) {
    self.postMessage({ type: "error", error: err?.message || String(err) });
  }
};
