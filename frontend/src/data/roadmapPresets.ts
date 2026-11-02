export interface RoadmapPresetDay {
  heading: string;
  description: string;
}

export interface RoadmapPreset {
  id: string;
  title: string;
  tagline: string;
  /** Name of a matching skill to auto-link when applying the template. */
  skillName?: string;
  days: RoadmapPresetDay[];
}

const javaDays: RoadmapPresetDay[] = [
  { heading: "Introduction", description: "Install JDK, set up VS Code and write your first Java program." },
  { heading: "Variables & Data Types", description: "Declare variables and work with Java data types." },
  { heading: "Operators", description: "Practice arithmetic, comparison and logical operators." },
  { heading: "Conditional Statements", description: "Understand if, else-if and else statements." },
  { heading: "For & While Loops", description: "Repeat operations using for and while loops." },
  { heading: "Loop Control", description: "Understand break, continue and nested loops." },
  { heading: "Mini Project: Calculator", description: "Build a calculator using variables, operators and conditions." },
  { heading: "Methods", description: "Create methods and pass parameters." },
  { heading: "Return Values & Overloading", description: "Practice returning values and method overloading." },
  { heading: "Arrays", description: "Store and access multiple values using one-dimensional arrays." },
  { heading: "2D Arrays", description: "Understand multidimensional arrays and nested loops." },
  { heading: "String Handling", description: "Learn string methods and manipulation techniques." },
  { heading: "Searching & Sorting", description: "Understand linear search, binary search and basic sorting." },
  { heading: "Mini Project: Student Marks System", description: "Create a system to calculate and display student results." },
  { heading: "Classes & Objects", description: "Understand the foundation of object-oriented programming." },
  { heading: "Constructors", description: "Learn how constructors initialize objects." },
  { heading: "Encapsulation", description: "Learn access modifiers, private fields and getters/setters." },
  { heading: "Inheritance", description: "Reuse properties and methods through parent and child classes." },
  { heading: "Polymorphism", description: "Understand method overriding and different object behaviours." },
  { heading: "Abstraction & Interfaces", description: "Learn abstract classes and interfaces." },
  { heading: "Mini Project: Bank Account System", description: "Build a banking application using OOP concepts." },
  { heading: "Exception Handling", description: "Handle runtime errors using try, catch and finally." },
  { heading: "Collections & ArrayList", description: "Learn dynamic data storage using Java collections." },
  { heading: "HashMap & HashSet", description: "Store and manage unique values and key-value pairs." },
  { heading: "File Handling", description: "Read, write and manage external files." },
  { heading: "Debugging & Code Organization", description: "Identify errors and organize programs into reusable components." },
  { heading: "Project Planning", description: "Design the structure and functionality of a Student Management System." },
  { heading: "Project Development – Part 1", description: "Implement student registration and record viewing." },
  { heading: "Project Development – Part 2", description: "Add update, delete and file storage functionality." },
  { heading: "Testing & Finalization", description: "Test, debug and finalize your Java project, then upload it to GitHub." },
];

const pythonDays: RoadmapPresetDay[] = [
  { heading: "Introduction", description: "Install Python, set up VS Code and write your first Python program." },
  { heading: "Variables & Data Types", description: "Understand strings, integers, floats and Boolean values." },
  { heading: "Operators", description: "Learn arithmetic, comparison, assignment and logical operators." },
  { heading: "Conditional Statements", description: "Learn if, elif and else statements." },
  { heading: "For & While Loops", description: "Practice repeating tasks using for and while loops." },
  { heading: "Loop Control", description: "Practice break, continue and nested loops." },
  { heading: "Mini Project: Calculator", description: "Create a functional calculator using Python fundamentals." },
  { heading: "Functions", description: "Understand how to create reusable functions." },
  { heading: "Parameters, Defaults & Scope", description: "Learn return values, default parameters and variable scope." },
  { heading: "Lists", description: "Create, access, update and remove list elements." },
  { heading: "Nested Lists", description: "Work with lists inside other lists." },
  { heading: "String Manipulation", description: "Practice slicing, formatting and built-in string methods." },
  { heading: "Searching & Sorting", description: "Practice searching and sorting algorithms." },
  { heading: "Mini Project: Student Marks System", description: "Build a student marks management application." },
  { heading: "Classes & Objects", description: "Create classes and objects using Python." },
  { heading: "Constructors (__init__)", description: "Understand the __init__() method and object initialization." },
  { heading: "Encapsulation", description: "Understand data protection and controlled access to attributes." },
  { heading: "Inheritance", description: "Implement single and multilevel inheritance." },
  { heading: "Polymorphism", description: "Practice method overriding and polymorphic behaviour." },
  { heading: "Abstraction", description: "Understand abstract classes and abstract methods." },
  { heading: "Mini Project: Bank Account System", description: "Implement deposits, withdrawals and account management." },
  { heading: "Exception Handling", description: "Manage errors using try, except and finally." },
  { heading: "Python Data Structures", description: "Practice lists, tuples, sets and dictionaries." },
  { heading: "Dictionary & Set Operations", description: "Practice key-value storage and unique collections." },
  { heading: "File Handling", description: "Work with text files using read, write and append modes." },
  { heading: "Debugging & Code Organization", description: "Debug Python programs and organize code into modules." },
  { heading: "Project Planning", description: "Plan the Student Management System structure and required functions." },
  { heading: "Project Development – Part 1", description: "Build student registration and record viewing." },
  { heading: "Project Development – Part 2", description: "Implement CRUD operations and file storage." },
  { heading: "Testing & Finalization", description: "Test, debug and finalize your Python project, then upload it to GitHub." },
];

const javaPythonDays: RoadmapPresetDay[] = [
  { heading: "Introduction & Setup", description: "Java: Install JDK, configure VS Code and write your first Java program. Python: Install Python, configure VS Code and write your first Python program." },
  { heading: "Variables & Data Types", description: "Java: Declare variables and work with different data types. Python: Understand strings, integers, floats and Boolean values." },
  { heading: "Operators", description: "Java: Practice arithmetic, comparison and logical operators. Python: Learn arithmetic, comparison, assignment and logical operators." },
  { heading: "Conditional Statements", description: "Java: Understand if, else-if and else statements. Python: Learn if, elif and else statements." },
  { heading: "For & While Loops", description: "Java: Learn how to repeat operations using loops. Python: Practice repeating tasks using for and while loops." },
  { heading: "Loop Control", description: "Java: Understand break, continue and nested loops. Python: Practice break, continue and nested loops." },
  { heading: "Mini Project: Calculator", description: "Java: Build a calculator using variables, operators and conditions. Python: Create a functional calculator using Python fundamentals." },
  { heading: "Methods & Functions", description: "Java: Learn how to create methods and pass parameters. Python: Understand how to create reusable functions." },
  { heading: "Return Values & Parameters", description: "Java: Practice returning values and method overloading. Python: Learn return values, default parameters and variable scope." },
  { heading: "Arrays & Lists", description: "Java: Store and access multiple values using one-dimensional arrays. Python: Create, access, update and remove list elements." },
  { heading: "2D Arrays & Nested Lists", description: "Java: Understand multidimensional arrays and nested loops. Python: Work with lists inside other lists." },
  { heading: "String Handling", description: "Java: Learn string methods and manipulation techniques. Python: Practice slicing, formatting and built-in string methods." },
  { heading: "Searching & Sorting", description: "Java: Understand linear search, binary search and basic sorting. Python: Practice searching and sorting algorithms." },
  { heading: "Mini Project: Student Marks System", description: "Java: Create a system to calculate and display student results. Python: Build a student marks management application." },
  { heading: "Classes & Objects", description: "Java: Understand the foundation of object-oriented programming. Python: Create classes and objects using Python." },
  { heading: "Constructors", description: "Java: Learn how constructors initialize objects. Python: Understand the __init__() method and object initialization." },
  { heading: "Encapsulation", description: "Java: Learn access modifiers, private fields and getters/setters. Python: Understand data protection and controlled access to attributes." },
  { heading: "Inheritance", description: "Java: Reuse properties and methods through parent and child classes. Python: Implement single and multilevel inheritance." },
  { heading: "Polymorphism", description: "Java: Understand method overriding and different object behaviours. Python: Practice method overriding and polymorphic behaviour." },
  { heading: "Abstraction & Interfaces", description: "Java: Learn abstract classes and interfaces. Python: Understand abstract classes and abstract methods." },
  { heading: "Mini Project: Bank Account System", description: "Java: Build a banking application using OOP concepts. Python: Implement deposits, withdrawals and account management." },
  { heading: "Exception Handling", description: "Java: Handle runtime errors using try, catch and finally. Python: Manage errors using try, except and finally." },
  { heading: "Collections & Data Structures", description: "Java: Learn dynamic data storage using collections and ArrayList. Python: Practice lists, tuples, sets and dictionaries." },
  { heading: "Key-Value & Unique Collections", description: "Java: Store and manage unique values and key-value pairs with HashMap & HashSet. Python: Practice dictionary and set operations." },
  { heading: "File Handling", description: "Java: Read, write and manage external files. Python: Work with text files using read, write and append modes." },
  { heading: "Debugging & Code Organization", description: "Java: Identify errors and organize programs into reusable components. Python: Debug Python programs and organize code into modules." },
  { heading: "Project Planning", description: "Java: Design the structure and functionality of a Student Management System. Python: Plan the application structure and required Python functions." },
  { heading: "Project Development – Part 1", description: "Java: Implement student registration and record viewing. Python: Build student registration and record viewing." },
  { heading: "Project Development – Part 2", description: "Java: Add update, delete and file storage functionality. Python: Implement CRUD operations and file storage." },
  { heading: "Testing & Finalization", description: "Java: Test, debug and finalize your Java project. Python: Test, debug and finalize your Python project." },
];

export const ROADMAP_PRESETS: RoadmapPreset[] = [
  {
    id: "java-30",
    title: "30-Day Java Roadmap",
    tagline: "1h/day: 15m learn · 20m examples · 20m code · 5m notes.",
    skillName: "Java Fundamentals",
    days: javaDays,
  },
  {
    id: "python-30",
    title: "30-Day Python Roadmap",
    tagline: "1h/day: 15m learn · 20m examples · 20m code · 5m notes.",
    skillName: "Python Fundamentals",
    days: pythonDays,
  },
  {
    id: "java-python-30",
    title: "30-Day Java & Python Learning Plan",
    tagline: "1h Java + 1h Python daily: fundamentals, OOP, file handling and a final project.",
    days: javaPythonDays,
  },
];
