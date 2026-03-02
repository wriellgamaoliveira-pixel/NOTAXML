// worker.js (classic)
// Lib ZIP rápida
importScripts("https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js");

function num(v){
  const n = parseFloat(String(v ?? "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function getText(xml, selector){
  return xml.querySelector(selector)?.textContent?.trim() || "";
}

// tenta achar CST ICMS em vários layouts (ICMS00/ICMS20/ICMS40/ICMS60/ICMSSNxxx etc)
function getCSTICMS(xml){
  // Simples Nacional costuma ter CSOSN
  const csosn = xml.querySelector("ICMS * CSOSN")?.textContent?.trim();
  if (csosn) return "CSOSN " + csosn;

  const cst = xml.querySelector("ICMS * CST")?.textContent?.trim();
  if (cst) return "CST " + cst;

  // fallback
  const any = xml.querySelector("CST")?.textContent?.trim();
  return any ? ("CST " + any) : "CST 000";
}

function getCFOP(xml){
  return xml.querySelector("CFOP")?.textContent?.trim()
      || xml.querySelector("cfop")?.textContent?.trim()
      || "0000";
}

function sumTag(xml, tag){
  // soma todas as ocorrências (ex.: vários itens)
  const nodes = Array.from(xml.getElementsByTagName(tag));
  if (!nodes.length) return 0;
  return nodes.reduce((acc, n) => acc + num(n.textContent), 0);
}

self.onmessage = async (event) => {
  try{
    const { zipBuffer } = event.data || {};
    if (!zipBuffer) throw new Error("ZIP inválido.");

    const zipData = new Uint8Array(zipBuffer);
    const unzipped = fflate.unzipSync(zipData);

    const names = Object.keys(unzipped).filter(n => n.toLowerCase().endsWith(".xml"));
    const total = names.length;

    const resumo = {
      total_xml: 0,
      total_valor_itens: 0,
      // tabela CST+CFOP
      por_cst_cfop: {}, // key => {cst, cfop, qtd_xml, valor_itens}
      // relatório por imposto (somatório)
      impostos: {
        ICMS: 0,
        PIS: 0,
        COFINS: 0,
        // você pode incluir outros depois
        // IRRF: 0, CSLL: 0 etc
      }
    };

    let processed = 0;

    for (const name of names){
      const xmlText = new TextDecoder().decode(unzipped[name]);

      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlText, "text/xml");

      // valor total de itens: tenta vProd (itens) somado
      // (em NF-e normalmente vProd aparece no total e também nos itens; aqui somamos tags vProd encontradas)
      const vProd = sumTag(xml, "vProd");
      resumo.total_valor_itens += vProd;

      // impostos (somando tags encontradas)
      // ICMS: vICMS
      // PIS: vPIS
      // COFINS: vCOFINS
      resumo.impostos.ICMS += sumTag(xml, "vICMS");
      resumo.impostos.PIS += sumTag(xml, "vPIS");
      resumo.impostos.COFINS += sumTag(xml, "vCOFINS");

      const cst = getCSTICMS(xml);
      const cfop = getCFOP(xml);
      const key = `${cst}__${cfop}`;

      if (!resumo.por_cst_cfop[key]){
        resumo.por_cst_cfop[key] = { cst, cfop, qtd_xml: 0, valor_itens: 0 };
      }
      resumo.por_cst_cfop[key].qtd_xml += 1;
      resumo.por_cst_cfop[key].valor_itens += vProd;

      resumo.total_xml += 1;
      processed += 1;

      // progresso a cada 50 XML
      if (processed % 50 === 0 || processed === total){
        const percent = total ? Math.round((processed / total) * 100) : 100;
        self.postMessage({ type: "progress", percent, processed, total });
      }
    }

    self.postMessage({ type: "done", result: resumo });
  } catch(err){
    self.postMessage({ type: "error", error: err?.message || String(err) });
  }
};