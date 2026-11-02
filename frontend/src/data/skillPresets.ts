export interface SkillPreset {
  name: string;
  group: "Java" | "Python" | "Shared";
}

export const SKILL_PRESETS: SkillPreset[] = [
  { name: "Java Fundamentals", group: "Java" },
  { name: "Java OOP (Classes, Inheritance, Polymorphism, Abstraction)", group: "Java" },
  { name: "Java Collections (ArrayList, HashMap, HashSet)", group: "Java" },
  { name: "Java Exception Handling", group: "Java" },
  { name: "Java File Handling", group: "Java" },
  { name: "Python Fundamentals", group: "Python" },
  { name: "Python OOP", group: "Python" },
  { name: "Python Data Structures (Lists, Tuples, Sets, Dictionaries)", group: "Python" },
  { name: "Python Exception Handling", group: "Python" },
  { name: "Python File Handling", group: "Python" },
  { name: "Searching & Sorting Algorithms", group: "Shared" },
  { name: "Debugging & Code Organization", group: "Shared" },
  { name: "Project Planning", group: "Shared" },
  { name: "VS Code", group: "Shared" },
  { name: "Git & GitHub", group: "Shared" },
];
