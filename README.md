# NotaXML - Sistema de Processamento de Notas Fiscais

Sistema 100% client-side para processamento de XMLs fiscais com suporte a mais de 50.000 notas, executavel diretamente no navegador sem necessidade de servidor.

## Caracteristicas

- **100% Client-Side**: Funciona inteiramente no navegador, sem backend
- **IndexedDB**: Armazenamento local persistente para grandes volumes de dados (gigabytes)
- **Web Workers**: Processamento assincrono sem travar a interface
- **Suporte a 50.000+ Notas**: Otimizado para grandes volumes
- **4 Modulos Fiscais**: NF-e, NFC-e, NFS-e e NFCom
- **Publicavel no GitHub Pages**: Site estatico, basta fazer deploy

## Funcionalidades

### Pagina Inicial
- Dashboard com estatisticas gerais
- Upload de arquivos ZIP com XMLs
- Acoes rapidas para relatorios

### Nota Unica
- Visualizacao individual de notas
- Busca e filtros
- Exportacao para CSV
- Download do XML original

### Relatorio por cClass
- Agrupamento por classificacao contabil
- Grafico pizza Top 12
- Detalhamento por nota
- Exportacao CSV

### Relatorio por Imposto
- Tabela CST ICMS + CFOP
- Tabela de Retencoes (PIS, COFINS, CSLL, IRRF)
- Graficos e totalizadores
- Exportacao CSV

### Relatorio CST/NCM
- Detalhamento por item fiscal
- Agregacao por CST ou NCM
- Grafico de barras
- Exportacao CSV

### Alteracao em Lote
- Alterar cClass por CFOP
- Alterar por descricao do produto
- Remover CFOP por CST
- Remover CFOP por cClass
- Download de ZIP com XMLs modificados

## Como Usar

### Publicar no GitHub Pages

1. Faca um fork ou clone deste repositorio
2. Va em Settings > Pages
3. Selecione a branch `main` e pasta `/root`
4. Acesse `https://seu-usuario.github.io/NOTAXML`

### Uso Local

1. Clone o repositorio
2. Abra `index.html` em um navegador moderno
3. Importe seus arquivos ZIP com XMLs
4. Navegue pelos relatorios

## Estrutura do Projeto

```
NOTAXML/
├── index.html              # Pagina inicial
├── nota-unica.html         # Visualizacao de nota individual
├── relatorio-cclass.html   # Relatorio por classificacao
├── relatorio-imposto.html  # Relatorio CST+CFOP e retencoes
├── relatorio-cst.html      # Relatorio CST/NCM por item
├── alteracao-lote.html     # Modificacao em massa de XMLs
├── css/
│   └── styles.css          # Estilos globais
├── js/
│   ├── db.js               # Modulo IndexedDB
│   ├── utils.js            # Utilitarios gerais
│   ├── app.js              # Aplicacao principal
│   └── worker.js           # Web Worker para processamento
└── README.md
```

## Tecnologias

- HTML5, CSS3, JavaScript ES6+
- IndexedDB para armazenamento
- Web Workers para processamento paralelo
- fflate para compressao/descompressao ZIP
- Chart.js para graficos
- Lucide Icons para icones

## Navegadores Suportados

- Chrome 70+
- Firefox 65+
- Safari 14+
- Edge 79+

## Licenca

MIT License
