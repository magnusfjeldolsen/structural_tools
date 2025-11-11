/**
 * Centralized SEO Metadata System for Structural Tools
 * This file contains all tool metadata for consistent SEO implementation
 */

// Tool categories with SEO information
const TOOL_CATEGORIES = {
  steel: {
    name: "Steel Design Tools",
    description: "Professional steel structure analysis and design calculators",
    keywords: ["steel design", "eurocode 3", "steel structures", "beam design", "fire resistance"],
    icon: "steel",
    color: "gray"
  },
  concrete: {
    name: "Concrete Design Tools",
    description: "Ultimate Limit State calculations for concrete structural elements",
    keywords: ["concrete design", "eurocode 2", "reinforcement", "ULS", "moment capacity"],
    icon: "concrete",
    color: "blue"
  },
  seismic: {
    name: "Seismic Design",
    description: "Seismic analysis and design tools according to Eurocode 8",
    keywords: ["seismic design", "eurocode 8", "earthquake", "response spectrum"],
    icon: "seismic",
    color: "red"
  },
  analysis: {
    name: "Structural Analysis Tools",
    description: "Advanced finite element analysis and structural modeling tools",
    keywords: ["structural analysis", "FEA", "frame analysis", "stiffness method"],
    icon: "analysis",
    color: "purple"
  },
  carbon: {
    name: "Concrete Carbon Reinforcement",
    description: "Carbon Fiber Reinforced Polymer (CFRP) strengthening analysis tools",
    keywords: ["CFRP", "carbon fiber", "strengthening", "rehabilitation"],
    icon: "carbon",
    color: "red"
  },
  data: {
    name: "Data Processing",
    description: "Tools for analyzing, clustering, and processing data from CSV files",
    keywords: ["data analysis", "clustering", "CSV processing", "data mining"],
    icon: "data",
    color: "cyan"
  },
  productivity: {
    name: "Productivity Tools",
    description: "Tools to improve workflow efficiency and document management",
    keywords: ["productivity", "document management", "workflow", "organization"],
    icon: "productivity",
    color: "emerald"
  }
};

// Complete tool metadata for SEO optimization
const TOOLS_METADATA = {
  // STEEL DESIGN TOOLS
  "steel_fire_temperature": {
    category: "steel",
    name: "Steel Fire Temperature Calculator",
    shortName: "Steel Fire Temperature",
    description: "Calculate fire resistance of unprotected steel structures with interactive temperature simulation. Features Am/V ratio calculation, shadow effects, and detailed temperature-time curves according to Eurocode 3.",
    shortDescription: "Fire resistance calculator for unprotected steel structures",
    keywords: ["steel fire resistance", "temperature calculation", "eurocode 3 fire", "am/v ratio", "unprotected steel", "fire design", "steel temperature"],
    longTailKeywords: ["free steel fire temperature calculator", "eurocode 3 fire resistance tool", "steel structure fire analysis"],
    path: "/steel_fire_temperature/",
    priority: 0.9,
    changefreq: "monthly",
    featured: true
  },

  "THP": {
    category: "steel",
    name: "Two-Sided Hat Profile Calculator",
    shortName: "Two-Sided Hat Profile",
    description: "Calculate structural capacities and cross-sectional classifications for two-sided hat profiles. Features Eurocode 3 compliance with detailed geometric property calculations.",
    shortDescription: "Structural capacity calculator for two-sided hat profiles",
    keywords: ["hat profile", "eurocode 3", "cross section", "steel profile", "structural capacity", "geometric properties"],
    longTailKeywords: ["two sided hat profile calculator", "hat section structural analysis", "steel hat profile design"],
    path: "/THP/",
    priority: 0.8,
    changefreq: "monthly"
  },

  "weld_capacity": {
    category: "steel",
    name: "Weld Capacity Calculator",
    shortName: "Weld Capacity",
    description: "Calculate weld capacity and utilization for steel welded connections. Features comprehensive stress analysis with normal force, shear force, and moment combinations using von Mises criteria.",
    shortDescription: "Weld capacity and stress analysis calculator",
    keywords: ["weld capacity", "weld design", "von mises stress", "welded connections", "steel welding", "capacity analysis"],
    longTailKeywords: ["free weld capacity calculator", "steel weld stress analysis tool", "welded connection design"],
    path: "/weld_capacity/",
    priority: 0.8,
    changefreq: "monthly"
  },

  "DIN_rod_torque": {
    category: "steel",
    name: "DIN Rod Torque Calculator",
    shortName: "DIN Rod Torque",
    description: "Calculate required torque from force or force from torque for DIN threaded rods. Features detailed step-by-step calculations with thread friction, head friction, and geometric parameters.",
    shortDescription: "Torque calculator for DIN threaded rods",
    keywords: ["DIN rod", "torque calculation", "threaded rod", "bolt torque", "thread mechanics", "fastener design"],
    longTailKeywords: ["DIN threaded rod torque calculator", "bolt torque force calculator", "threaded fastener analysis"],
    path: "/DIN_rod_torque/",
    priority: 0.7,
    changefreq: "monthly"
  },

  "steel_beam_relative_deisgn": {
    category: "steel",
    name: "Steel Profile Calculator",
    shortName: "Steel Profile Calculator",
    description: "Compare IPE, HEA, and HEB steel profiles for optimal structural performance and weight efficiency. Features moment capacity, deflection analysis, and comprehensive profile comparison.",
    shortDescription: "Steel profile comparison and optimization tool",
    keywords: ["steel profiles", "IPE", "HEA", "HEB", "beam design", "profile comparison", "weight optimization"],
    longTailKeywords: ["steel beam profile calculator", "IPE HEA HEB comparison tool", "steel section optimization"],
    path: "/steel_beam_relative_deisgn/",
    priority: 0.8,
    changefreq: "monthly"
  },

  "transversal_forces_stiffened_web": {
    category: "steel",
    name: "Transversal Forces - Stiffened Web",
    shortName: "Stiffened Web Forces",
    description: "Calculate capacity of transversally stiffened webs for vertical forces. Features automatic steel section database integration, web height calculation, and slenderness checks per EC3-1-5.",
    shortDescription: "Stiffened web capacity calculator per EC3-1-5",
    keywords: ["stiffened web", "transversal forces", "EC3-1-5", "web capacity", "steel sections", "slenderness"],
    longTailKeywords: ["stiffened web capacity calculator", "transversal force analysis EC3", "steel web design tool"],
    path: "/transversal_forces_stiffened_web/",
    priority: 0.7,
    changefreq: "monthly"
  },

  "transversal_forces_unstiffened_web": {
    category: "steel",
    name: "Transversal Forces - Unstiffened Web",
    shortName: "Unstiffened Web Forces",
    description: "Calculate capacity of unstiffened webs for transversal forces according to EC3-1-5. Features iterative calculation procedure, multiple load types, and steel section database integration.",
    shortDescription: "Unstiffened web capacity calculator per EC3-1-5",
    keywords: ["unstiffened web", "transversal forces", "EC3-1-5", "web capacity", "load types", "iterative calculation"],
    longTailKeywords: ["unstiffened web calculator", "web capacity EC3-1-5", "transversal force design"],
    path: "/transversal_forces_unstiffened_web/",
    priority: 0.7,
    changefreq: "monthly"
  },

  // CONCRETE DESIGN TOOLS
  "concrete_minimum_reinforcement": {
    category: "concrete",
    name: "Concrete Minimum Reinforcement Calculator",
    shortName: "Minimum Reinforcement",
    description: "Calculate minimum reinforcement for concrete structures according to EC2 and other standards. Features plates, beams, columns, and gulv på grunn calculations with scenario-based analysis and spacing compliance checks.",
    shortDescription: "Minimum reinforcement calculator per EC2 standards",
    keywords: ["minimum reinforcement", "concrete reinforcement", "EC2", "plate reinforcement", "spacing requirements", "reinforcement calculation"],
    longTailKeywords: ["concrete minimum reinforcement calculator EC2", "plate reinforcement design tool", "EC2 minimum rebar calculator"],
    path: "/concrete_minimum_reinforcement/",
    priority: 0.9,
    changefreq: "monthly",
    featured: true,
    newTool: true
  },

  "concrete_slab_design": {
    category: "concrete",
    name: "Concrete Slab Design Calculator",
    shortName: "Concrete Slab Design",
    description: "Ultimate Limit State (ULS) moment resistance calculator for concrete slabs. Calculate MRd with detailed step-by-step mathematical derivations and visual aids according to Eurocode 2.",
    shortDescription: "ULS moment resistance calculator for concrete slabs",
    keywords: ["concrete slab", "ULS design", "moment resistance", "MRd", "reinforcement", "eurocode 2"],
    longTailKeywords: ["concrete slab design calculator", "slab moment resistance tool", "ULS concrete design"],
    path: "/concrete_slab_design/",
    priority: 0.9,
    changefreq: "monthly"
  },

  "concrete_beam_design": {
    category: "concrete",
    name: "Concrete Beam Design Calculator",
    shortName: "Concrete Beam Design",
    description: "Ultimate Limit State (ULS) calculator for concrete beams. Calculate moment and shear capacity with detailed step-by-step derivations according to Eurocode 2.",
    shortDescription: "ULS calculator for concrete beam design",
    keywords: ["concrete beam", "ULS design", "moment capacity", "shear design", "beam reinforcement", "eurocode 2"],
    longTailKeywords: ["concrete beam design calculator", "beam capacity calculator", "concrete beam ULS"],
    path: "/concrete_beam_design/",
    priority: 0.9,
    changefreq: "monthly"
  },

  "ec2concrete": {
    category: "concrete",
    name: "EC2 Concrete Material Parameters",
    shortName: "EC2 Material Parameters",
    description: "Calculate all concrete material parameters according to Eurocode 2 Table 3.1. Select concrete grade and get fck,cube, fcm, fctm, Ecm, strain parameters, and more with analytical formulas.",
    shortDescription: "Eurocode 2 concrete material properties calculator",
    keywords: ["EC2", "concrete properties", "material parameters", "eurocode 2", "fctm", "concrete grade", "table 3.1"],
    longTailKeywords: ["EC2 concrete properties calculator", "eurocode 2 material parameters", "concrete grade properties"],
    path: "/ec2concrete/",
    priority: 0.8,
    changefreq: "monthly"
  },

  "concrete_base_plate_compressive_design": {
    category: "concrete",
    name: "Concrete Base Plate Calculator",
    shortName: "Concrete Base Plate",
    description: "Calculate compressive capacity of concrete base plates with detailed step-by-step calculations. Features effective area determination and steel plate spread calculations per EC3-1-8.",
    shortDescription: "Concrete base plate compressive capacity calculator",
    keywords: ["base plate", "compressive capacity", "concrete base", "EC3-1-8", "effective area", "steel plate"],
    longTailKeywords: ["concrete base plate calculator", "base plate design tool", "compressive capacity calculator"],
    path: "/concrete_base_plate_compressive_design/",
    priority: 0.7,
    changefreq: "monthly"
  },

  "concrete_dowels": {
    category: "concrete",
    name: "Concrete Dowels Calculator",
    shortName: "Concrete Dowels",
    description: "Calculate shear capacity for concrete dowel connections according to Norwegian Betongelementboken. Features comprehensive analysis with distance factors, utilization checks, and interactive geometry visualization.",
    shortDescription: "Concrete dowel shear capacity calculator",
    keywords: ["concrete dowels", "shear capacity", "dowel connections", "betongelementboken", "distance factors", "dowel design"],
    longTailKeywords: ["concrete dowel calculator", "dowel shear capacity tool", "concrete connection design"],
    path: "/concrete_dowels/",
    priority: 0.7,
    changefreq: "monthly"
  },

  // CONCRETE CARBON REINFORCEMENT
  "concrete_plate_CFRP": {
    category: "carbon",
    name: "Concrete Plate - Flexural Carbon Fibre Reinforcement",
    shortName: "CFRP Reinforcement",
    description: "Calculate carbon fiber reinforcement effects on concrete plates with detailed step-by-step analysis. Features moment capacity calculations, section classification, and CFRP strengthening verification.",
    shortDescription: "CFRP strengthening calculator for concrete plates",
    keywords: ["CFRP", "carbon fiber", "strengthening", "concrete reinforcement", "flexural reinforcement", "rehabilitation"],
    longTailKeywords: ["CFRP concrete strengthening calculator", "carbon fiber reinforcement tool", "concrete plate CFRP design"],
    path: "/concrete_plate_CFRP/",
    priority: 0.7,
    changefreq: "monthly"
  },

  // SEISMIC DESIGN
  "seismic_ec8": {
    category: "seismic",
    name: "EC8 Seismic Avoidance Criteria",
    shortName: "Seismic Avoidance",
    description: "Calculate if seismic design is required according to Eurocode 8 avoidance criteria. Features response spectrum analysis, parameter summary, and interactive visualization with real-time updates.",
    shortDescription: "Eurocode 8 seismic avoidance criteria calculator",
    keywords: ["seismic design", "eurocode 8", "avoidance criteria", "response spectrum", "earthquake design", "EC8"],
    longTailKeywords: ["EC8 seismic avoidance calculator", "eurocode 8 criteria tool", "seismic design requirements"],
    path: "/seismic_ec8/",
    priority: 0.8,
    changefreq: "monthly"
  },

  // STRUCTURAL ANALYSIS
  "2dframeanalysis": {
    category: "analysis",
    name: "2D Frame Analysis",
    shortName: "2D Frame Analysis",
    description: "Advanced finite element analysis of 2D frame structures using matrix stiffness method. Features interactive displaced shape visualization, D3.js hover tooltips, and auto-loads a 10m simply supported beam test case.",
    shortDescription: "2D frame finite element analysis tool",
    keywords: ["2D frame analysis", "finite element", "matrix stiffness", "FEA", "structural analysis", "frame structures"],
    longTailKeywords: ["2D frame analysis calculator", "finite element frame tool", "structural frame analysis"],
    path: "/2dframeanalysis/",
    priority: 0.8,
    changefreq: "monthly",
    beta: true
  },

  // DATA PROCESSING
  "clustering": {
    category: "data",
    name: "1D CSV Clustering Tool",
    shortName: "CSV Clustering",
    description: "Upload a CSV file, select a column and cluster by numeric values in the column. Advanced data analysis tool for processing and analyzing structural engineering data sets.",
    shortDescription: "CSV data clustering and analysis tool",
    keywords: ["CSV clustering", "data analysis", "1D clustering", "data processing", "file analysis", "data mining"],
    longTailKeywords: ["CSV clustering tool", "data analysis calculator", "file processing tool"],
    path: "/clustering/",
    priority: 0.6,
    changefreq: "monthly"
  },

  // PRODUCTIVITY TOOLS
  "deliveryhub": {
    category: "productivity",
    name: "Delivery Hub",
    shortName: "Delivery Hub",
    description: "Advanced document management and delivery organization tool. Organize files by categories and subcategories, set folder paths, copy file paths, split filenames, and manage deliveries with persistence and export/import functionality.",
    shortDescription: "Document management and delivery organization tool",
    keywords: ["document management", "file organization", "delivery tracking", "productivity", "file management", "project organization"],
    longTailKeywords: ["delivery hub tool", "document organization system", "file management tool"],
    path: "/deliveryhub/",
    priority: 0.6,
    changefreq: "monthly"
  }
};

// SEO utility functions
const SEOUtils = {
  /**
   * Generate page title for a tool
   */
  generateTitle(toolId) {
    const tool = TOOLS_METADATA[toolId];
    const category = TOOL_CATEGORIES[tool.category];
    return `${tool.name} | Free ${category.name.split(' ')[0]} Engineering Tool`;
  },

  /**
   * Generate meta description for a tool
   */
  generateDescription(toolId) {
    const tool = TOOLS_METADATA[toolId];
    return tool.description.length > 160
      ? tool.description.substring(0, 157) + '...'
      : tool.description;
  },

  /**
   * Generate keywords string for a tool
   */
  generateKeywords(toolId) {
    const tool = TOOLS_METADATA[toolId];
    const category = TOOL_CATEGORIES[tool.category];
    return [...tool.keywords, ...category.keywords, 'free engineering tool', 'structural calculator'].join(', ');
  },

  /**
   * Generate canonical URL for a tool
   */
  generateCanonicalURL(toolId) {
    const tool = TOOLS_METADATA[toolId];
    return `https://magnusfjeldolsen.github.io/structural_tools${tool.path}`;
  },

  /**
   * Get all tools in a category
   */
  getToolsByCategory(categoryId) {
    return Object.entries(TOOLS_METADATA)
      .filter(([_, tool]) => tool.category === categoryId)
      .map(([id, tool]) => ({ id, ...tool }));
  },

  /**
   * Get featured tools
   */
  getFeaturedTools() {
    return Object.entries(TOOLS_METADATA)
      .filter(([_, tool]) => tool.featured)
      .map(([id, tool]) => ({ id, ...tool }));
  },

  /**
   * Generate sitemap data
   */
  generateSitemapData() {
    const baseURL = 'https://magnusfjeldolsen.github.io/structural_tools';
    const urls = [
      {
        loc: baseURL + '/',
        changefreq: 'weekly',
        priority: 1.0,
        lastmod: new Date().toISOString().split('T')[0]
      }
    ];

    Object.entries(TOOLS_METADATA).forEach(([id, tool]) => {
      urls.push({
        loc: baseURL + tool.path,
        changefreq: tool.changefreq,
        priority: tool.priority,
        lastmod: new Date().toISOString().split('T')[0]
      });
    });

    return urls;
  }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TOOL_CATEGORIES, TOOLS_METADATA, SEOUtils };
}