/**
 * SV0.2 - the fixed capability vocabulary used to tag each whitepaper. Deterministic on purpose: a regex hit is
 * auditable ("it says 'XGBoost' on page 2"), an LLM tag is not. Order is the output order.
 *
 * These names are the seed vocabulary for `service_offerings.capabilities_json` (SV1.1) and for the Gov AI prompt
 * (SV4.1), so they are phrased the way a solicitation phrases a need.
 */
export const CAPABILITY_VOCABULARY: ReadonlyArray<{ name: string; patterns: RegExp[] }> = [
  { name: 'Demand & Load Forecasting', patterns: [/load forecast/i, /demand forecast/i, /energy forecast/i, /forecast(ing)? (of )?(energy|power|consumption|demand)/i] },
  { name: 'Time-Series Forecasting', patterns: [/time[- ]series/i, /\bARIMA\b/, /\bLSTM\b/, /\bProphet\b/, /forecast/i] },
  { name: 'Predictive Maintenance', patterns: [/predictive maintenance/i, /time[- ]to[- ]failure/i, /equipment failure/i] },
  { name: 'Anomaly Detection', patterns: [/anomal(y|ies)/i, /outlier detection/i, /isolation forest/i] },
  { name: 'Computer Vision', patterns: [/computer vision/i, /\bCNN\b/, /convolutional/i, /image (classification|recognition|analysis)/i, /\bYOLO\b/] },
  { name: 'Deep Learning', patterns: [/deep learning/i, /neural network/i, /\bCNN\b/, /\bLSTM\b/, /transformer/i] },
  { name: 'Machine Learning Modeling', patterns: [/machine learning/i, /\bXGBoost\b/i, /random forest/i, /gradient boosting/i, /regression model/i] },
  { name: 'Econometrics & Pricing Optimization', patterns: [/econometric/i, /pricing (model|strategy|optimization)/i, /price elasticit/i] },
  { name: 'Recommendation Systems', patterns: [/recommendation (engine|system|model)s?/i, /recommender/i, /product substitution/i] },
  { name: 'Geospatial & Remote Sensing Analytics', patterns: [/geospatial/i, /\bGIS\b/, /remote sensing/i, /satellite/i, /\bLiDAR\b/i] },
  { name: 'Hyperspectral & Imaging Analytics', patterns: [/hyperspectral/i, /multispectral/i] },
  { name: 'Digital Twin & Simulation', patterns: [/digital twin/i, /simulation/i] },
  { name: 'IoT & Real-Time Streaming', patterns: [/\bIoT\b/, /real[- ]time stream/i, /\bKinesis\b/i, /\bKafka\b/i, /sensor (data|telemetry)/i] },
  { name: 'Data Engineering & ETL Pipelines', patterns: [/data engineering/i, /\bETL\b/, /data pipeline/i, /\bAWS Glue\b/i, /data lake/i, /\bDatabricks\b/i] },
  { name: 'Data Quality & Governance', patterns: [/data quality/i, /data governance/i, /data validation/i, /data cleansing/i] },
  { name: 'Business Intelligence & Dashboards', patterns: [/dashboard/i, /\bPower BI\b/i, /\bTableau\b/i, /\bQuickSight\b/i, /reporting/i] },
  { name: 'Conversational AI & Chatbots', patterns: [/chatbot/i, /\bbot flows?\b/i, /conversational/i, /voice (agent|assistant|solution)/i, /\bXenioo\b/i] },
  { name: 'Agentic AI & LLM Applications', patterns: [/agentic/i, /large language model/i, /\bLLM\b/, /generative ai/i, /\bGPT\b/] },
  { name: 'Natural Language Processing', patterns: [/natural language/i, /\bNLP\b/, /text analysis/i, /speech[- ]to[- ]text/i] },
  { name: 'Generative & Molecular AI', patterns: [/molecular generation/i, /generative model/i, /\bVAE\b/, /\bGAN\b/] },
  { name: 'Genomics & Lab Automation', patterns: [/genotyp/i, /\bDNA\b/, /spatial biology/i, /laboratory/i, /\bLIMS\b/i] },
  { name: 'Credit Risk & Financial Scoring', patterns: [/credit (risk|scor)/i, /risk assessment/i, /financial access/i, /loan/i] },
  { name: 'Cloud Migration & Replatforming', patterns: [/re-?platform/i, /cloud migration/i, /migrat(e|ion) to (the )?(AWS|cloud|Azure)/i] },
  { name: 'Cloud Infrastructure & DevOps', patterns: [/\bTerraform\b/i, /\bAWS\b/, /\bAzure\b/i, /\bCI\/CD\b/i, /\bKubernetes\b/i, /\bDocker\b/i] },
  { name: 'Application Security & CDN', patterns: [/\bAkamai\b/i, /\bWAF\b/, /web application firewall/i, /cybersecurity/i, /\bDDoS\b/i] },
  { name: 'Web & Mobile Application Development', patterns: [/\bAngular\b/i, /\bReact\b/, /mobile app/i, /web[- ]based/i, /web application/i, /push notification/i] },
  { name: 'Customer Engagement & Notifications', patterns: [/push notification/i, /customer (communication|engagement|notification)/i, /\bSMS\b/, /appointment/i, /scheduling/i] },
  { name: 'Medical Imaging AI', patterns: [/bone age/i, /radiograph/i, /x[- ]ray/i, /medical imag/i] },
  { name: 'Environmental & Climate Analytics', patterns: [/wildfire/i, /coastal/i, /environmental monitoring/i, /climate/i, /drought/i] },
  { name: 'Agricultural Analytics', patterns: [/crop/i, /\bnitrogen\b/i, /fungicide/i, /\bseed\b/i, /nursery/i, /farmer/i, /agronom/i] },
];

/** Every capability whose pattern matches, in vocabulary order. Pure and deterministic. */
export function tagCapabilities(text: string): string[] {
  return CAPABILITY_VOCABULARY.filter((c) => c.patterns.some((p) => p.test(text))).map((c) => c.name);
}
