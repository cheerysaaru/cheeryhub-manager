export interface RoadmapPresetDay {
  heading: string;
  description: string;
}

export interface RoadmapPreset {
  id: string;
  title: string;
  tagline: string;
  days: RoadmapPresetDay[];
}

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
    id: "java-python-30",
    title: "30-Day Java & Python Learning Plan",
    tagline: "1h Java + 1h Python daily: fundamentals, OOP, file handling and a final project.",
    days: javaPythonDays,
  },
];
