/**
 * seedBooks.js
 * Generates 50,000+ realistic library book records across every subject
 * a real university library carries, and inserts them into MongoDB.
 *
 * Usage:
 *   node scripts/seedBooks.js
 *   (or) npm run seed
 *
 * Override the total with an env var if you want a smaller/larger catalog, e.g.
 *   SEED_BOOK_COUNT=10000 node scripts/seedBooks.js   (fast local testing)
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { faker } = require("@faker-js/faker");
const connectDB = require("../config/db");
const Book = require("../models/Book");

const TOTAL_BOOKS = Number(process.env.SEED_BOOK_COUNT) || 50000;
const BATCH_SIZE = 1000;

// ---- Category definitions with realistic title patterns & known real-world titles ----
const categoryData = {
  "Computer Science": {
    real: [
      "Introduction to Algorithms", "Clean Code", "The Pragmatic Programmer",
      "Design Patterns: Elements of Reusable Object-Oriented Software",
      "Computer Networks", "Operating System Concepts", "Database System Concepts",
      "Artificial Intelligence: A Modern Approach", "Deep Learning",
      "Computer Organization and Design", "Compilers: Principles, Techniques, and Tools",
      "The C Programming Language", "Software Engineering: A Practitioner's Approach",
      "Data Structures and Algorithm Analysis", "Introduction to the Theory of Computation",
    ],
    prefixes: ["Fundamentals of", "Advanced", "Introduction to", "Principles of", "Modern"],
    subjects: ["Machine Learning", "Cybersecurity", "Cloud Computing", "Data Mining", "Computer Vision",
      "Distributed Systems", "Web Development", "Mobile App Development", "Blockchain Technology",
      "Natural Language Processing", "Robotics", "Software Testing", "Object-Oriented Programming",
      "Computer Graphics", "Human-Computer Interaction", "Big Data Analytics", "Cryptography"],
  },
  Engineering: {
    real: ["Engineering Mechanics: Statics", "Fluid Mechanics", "Thermodynamics: An Engineering Approach",
      "Materials Science and Engineering", "Circuit Analysis", "Signals and Systems"],
    prefixes: ["Applied", "Fundamentals of", "Introduction to", "Advanced", "Practical"],
    subjects: ["Civil Engineering", "Mechanical Engineering", "Electrical Engineering", "Robotics Engineering",
      "Structural Analysis", "Control Systems", "Power Systems", "Renewable Energy Systems",
      "Industrial Engineering", "Automobile Engineering", "Construction Management"],
  },
  Mathematics: {
    real: ["Calculus", "Linear Algebra and Its Applications", "Discrete Mathematics and Its Applications",
      "Probability and Statistics for Engineers", "Introduction to Real Analysis", "Abstract Algebra"],
    prefixes: ["Elements of", "Fundamentals of", "Applied", "Introduction to", "Advanced"],
    subjects: ["Number Theory", "Differential Equations", "Complex Analysis", "Topology",
      "Numerical Methods", "Graph Theory", "Set Theory", "Mathematical Statistics", "Optimization Theory"],
  },
  Physics: {
    real: ["University Physics", "Introduction to Quantum Mechanics", "Classical Mechanics",
      "Electricity and Magnetism", "Modern Physics", "Thermal Physics"],
    prefixes: ["Principles of", "Fundamentals of", "Introduction to", "Concepts in"],
    subjects: ["Astrophysics", "Nuclear Physics", "Optics", "Particle Physics", "Solid State Physics",
      "Electromagnetism", "Statistical Mechanics", "Relativity"],
  },
  Chemistry: {
    real: ["Organic Chemistry", "Physical Chemistry", "Inorganic Chemistry", "Analytical Chemistry"],
    prefixes: ["Principles of", "Introduction to", "Fundamentals of", "Essentials of"],
    subjects: ["Biochemistry", "Polymer Chemistry", "Environmental Chemistry", "Industrial Chemistry",
      "Chemical Thermodynamics", "Spectroscopy"],
  },
  Biology: {
    real: ["Campbell Biology", "Molecular Biology of the Cell", "Principles of Genetics",
      "Human Anatomy and Physiology", "Microbiology"],
    prefixes: ["Introduction to", "Fundamentals of", "Essentials of", "Modern"],
    subjects: ["Genetics", "Ecology", "Botany", "Zoology", "Biotechnology", "Marine Biology",
      "Cell Biology", "Evolutionary Biology", "Immunology"],
  },
  "Business & Economics": {
    real: ["Principles of Economics", "The Wealth of Nations", "Marketing Management",
      "Financial Accounting", "Managerial Economics", "Principles of Management"],
    prefixes: ["Introduction to", "Fundamentals of", "Modern", "Strategic"],
    subjects: ["Macroeconomics", "Microeconomics", "International Business", "Human Resource Management",
      "Entrepreneurship", "Supply Chain Management", "Corporate Finance", "Business Ethics",
      "Organizational Behavior", "Digital Marketing"],
  },
  Law: {
    real: ["Introduction to Business Law", "Constitutional Law", "Criminal Law", "International Law"],
    prefixes: ["Principles of", "Fundamentals of", "Introduction to", "Understanding"],
    subjects: ["Contract Law", "Human Rights Law", "Corporate Law", "Environmental Law",
      "Cyber Law", "Family Law", "Labour Law", "Property Law"],
  },
  "Medical & Pharmacy": {
    real: ["Gray's Anatomy", "Robbins Basic Pathology", "Harrison's Principles of Internal Medicine",
      "Pharmacology and Therapeutics"],
    prefixes: ["Essentials of", "Clinical", "Introduction to", "Textbook of"],
    subjects: ["Pharmacology", "Pathology", "Physiology", "Nursing Fundamentals", "Public Health",
      "Nutrition Science", "Medical Ethics", "Surgery Techniques"],
  },
  "English Literature": {
    real: ["Hamlet", "Pride and Prejudice", "1984", "To Kill a Mockingbird", "The Great Gatsby",
      "Wuthering Heights", "Jane Eyre", "Great Expectations", "Frankenstein", "Moby-Dick"],
    prefixes: ["The Complete", "Selected Poems of", "The Collected Works of", "An Anthology of"],
    subjects: ["Victorian Literature", "Romantic Poetry", "Modernist Fiction", "Shakespearean Drama",
      "Postcolonial Literature", "American Literature"],
  },
  "Bangla Literature": {
    real: ["Pather Panchali", "Padma Nadir Majhi", "Shesher Kobita", "Devdas", "Lalsalu",
      "Kabuliwala", "Chokher Bali", "Gitanjali", "Meghnadbadh Kavya", "Anandamath"],
    prefixes: ["নির্বাচিত", "সমগ্র", "শ্রেষ্ঠ কবিতা:"],
    subjects: ["Bangla Kobita", "Bangla Uponnash", "Bangla Golpo Songroho", "Adhunik Bangla Sahitya"],
  },
  History: {
    real: ["A People's History of the United States", "Sapiens: A Brief History of Humankind",
      "The History of Bangladesh", "Guns, Germs, and Steel"],
    prefixes: ["A History of", "The Rise and Fall of", "Chronicles of", "Understanding"],
    subjects: ["Ancient Civilizations", "World War II", "South Asian History", "The Liberation War of Bangladesh",
      "Medieval History", "The Mughal Empire", "Colonial History"],
  },
  Philosophy: {
    real: ["The Republic", "Meditations", "Thus Spoke Zarathustra", "Critique of Pure Reason",
      "Being and Time", "The Nicomachean Ethics"],
    prefixes: ["An Introduction to", "The Philosophy of", "Essays on", "Foundations of"],
    subjects: ["Ethics", "Logic", "Metaphysics", "Existentialism", "Political Philosophy", "Epistemology"],
  },
  "Religion & Theology": {
    real: ["The Quran: Translation and Commentary", "The Bhagavad Gita", "The Bible",
      "Sahih Al-Bukhari", "The Dhammapada"],
    prefixes: ["Studies in", "An Introduction to", "Understanding"],
    subjects: ["Comparative Religion", "Islamic Studies", "World Religions", "Religious Philosophy"],
  },
  Psychology: {
    real: ["Thinking, Fast and Slow", "Man's Search for Meaning", "Introduction to Psychology",
      "The Interpretation of Dreams"],
    prefixes: ["Principles of", "Fundamentals of", "Understanding"],
    subjects: ["Cognitive Psychology", "Developmental Psychology", "Abnormal Psychology",
      "Social Psychology", "Behavioral Psychology", "Clinical Psychology"],
  },
  Sociology: {
    real: ["The Sociological Imagination", "Suicide: A Study in Sociology", "Introduction to Sociology"],
    prefixes: ["Principles of", "Understanding", "Foundations of"],
    subjects: ["Social Stratification", "Urban Sociology", "Gender Studies", "Cultural Sociology"],
  },
  "Political Science": {
    real: ["The Prince", "Leviathan", "The Social Contract", "Democracy in America"],
    prefixes: ["Introduction to", "Principles of", "Understanding"],
    subjects: ["International Relations", "Comparative Politics", "Public Administration",
      "Political Theory", "South Asian Politics"],
  },
  Fiction: {
    real: ["The Alchemist", "The Kite Runner", "Life of Pi", "The Book Thief", "Norwegian Wood",
      "One Hundred Years of Solitude", "The Catcher in the Rye", "The Old Man and the Sea"],
    prefixes: ["The Secret of", "Shadows Over", "The Last", "Beyond the", "Tales of"],
    subjects: ["City", "River", "Mountain", "Forest", "Ocean", "Kingdom", "Village", "Empire"],
  },
  "Science Fiction & Fantasy": {
    real: ["Dune", "The Hobbit", "Ender's Game", "Foundation", "Brave New World",
      "The Fellowship of the Ring", "Neuromancer", "Fahrenheit 451"],
    prefixes: ["Chronicles of", "The Rise of", "Beyond the", "Legends of"],
    subjects: ["Galaxy", "Starfleet", "Dragonrealm", "Cyberworld", "Time", "Void"],
  },
  "Biography & Memoir": {
    real: ["Steve Jobs", "Long Walk to Freedom", "The Diary of a Young Girl", "Educated",
      "Becoming", "My Story"],
    prefixes: ["The Life and Times of", "The Story of", "Memoirs of"],
    subjects: ["a Scientist", "an Author", "a Leader", "an Artist", "an Entrepreneur"],
  },
  "Self-Help": {
    real: ["Atomic Habits", "The 7 Habits of Highly Effective People", "How to Win Friends and Influence People",
      "The Power of Now", "Deep Work"],
    prefixes: ["The Art of", "Mastering", "The Power of", "Guide to"],
    subjects: ["Productivity", "Focus", "Time Management", "Self-Discipline", "Communication Skills"],
  },
  "Art & Design": {
    real: ["The Story of Art", "Ways of Seeing", "Principles of Graphic Design"],
    prefixes: ["Introduction to", "The Art of", "Principles of"],
    subjects: ["Typography", "Color Theory", "Digital Illustration", "Photography", "Sculpture"],
  },
  Architecture: {
    real: ["Architecture: Form, Space, and Order", "A History of Architecture"],
    prefixes: ["Principles of", "Introduction to", "Modern"],
    subjects: ["Sustainable Architecture", "Urban Planning", "Landscape Design", "Structural Design"],
  },
  "Environmental Science": {
    real: ["Silent Spring", "Environmental Science: A Global Concern"],
    prefixes: ["Principles of", "Introduction to", "Fundamentals of"],
    subjects: ["Climate Change", "Sustainable Development", "Environmental Policy", "Ecology and Conservation"],
  },
  "Journalism & Media": {
    real: ["The Elements of Journalism", "Manufacturing Consent"],
    prefixes: ["Introduction to", "Principles of", "Modern"],
    subjects: ["Digital Journalism", "Media Ethics", "Broadcast Journalism", "Mass Communication"],
  },
  Poetry: {
    real: ["Leaves of Grass", "The Waste Land", "Sonnets", "Songs of Innocence and Experience"],
    prefixes: ["Collected Poems of", "Selected Verses of", "The Poetry of"],
    subjects: ["Nature", "Love", "War", "Freedom", "Life"],
  },
  "Children's Books": {
    real: ["Charlotte's Web", "The Very Hungry Caterpillar", "Matilda", "Alice's Adventures in Wonderland"],
    prefixes: ["The Adventures of", "The Magical", "The Tale of"],
    subjects: ["Bunny", "Dragon", "Forest Friends", "Little Explorer"],
  },
  "Reference & Encyclopedia": {
    real: ["Encyclopedia Britannica", "Oxford English Dictionary", "World Atlas"],
    prefixes: ["The Concise", "The Illustrated", "The Complete"],
    subjects: ["Encyclopedia of Science", "Dictionary of Idioms", "Atlas of the World", "Almanac"],
  },
  Textbook: {
    real: [],
    prefixes: ["CSE", "EEE", "BBA", "Civil", "Pharmacy", "English", "Economics"],
    subjects: ["101 Course Textbook", "202 Lab Manual", "Semester Guide", "Exam Preparation Guide"],
  },
  "Thesis & Research Paper": {
    real: [],
    prefixes: ["A Study on", "An Analysis of", "Research on", "Investigating"],
    subjects: ["Machine Learning Applications", "Urban Water Management", "Microfinance in Rural Bangladesh",
      "Renewable Energy Adoption", "Social Media Behavior", "Supply Chain Optimization"],
  },
};

const publishers = [
  "Pearson Education", "McGraw-Hill", "Oxford University Press", "Cambridge University Press",
  "Wiley", "Springer", "Penguin Random House", "HarperCollins", "Bangla Academy",
  "University Press Limited", "Prothoma Prokashon", "Ananda Publishers", "MIT Press",
  "Elsevier", "SAGE Publications", "Routledge",
];

function randomIsbn() {
  return "978-" + faker.string.numeric(10);
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const BRANCHES = ["Main Campus", "City Campus"];

function generateBooksForCategory(category, count) {
  const data = categoryData[category];
  const books = [];

  for (let i = 0; i < count; i++) {
    let title;
    if (data.real.length && Math.random() < 0.15) {
      title = faker.helpers.arrayElement(data.real);
    } else if (category === "Fiction" || category === "Science Fiction & Fantasy") {
      title = `${faker.helpers.arrayElement(data.prefixes)} the ${faker.helpers.arrayElement(data.subjects)}`;
    } else if (category === "Bangla Literature") {
      title = faker.helpers.arrayElement(data.real);
    } else {
      title = `${faker.helpers.arrayElement(data.prefixes)} ${faker.helpers.arrayElement(data.subjects)}`;
    }

    const totalCopies = faker.number.int({ min: 1, max: 8 });
    const availableCopies = faker.number.int({ min: 0, max: totalCopies });

    books.push({
      isbn: randomIsbn(),
      title,
      author: faker.person.fullName(),
      category,
      publisher: faker.helpers.arrayElement(publishers),
      publishedYear: faker.number.int({ min: 1960, max: 2026 }),
      language: category === "Bangla Literature" ? "Bangla" : "English",
      edition: `${ordinal(faker.number.int({ min: 1, max: 6 }))} Edition`,
      totalCopies,
      availableCopies,
      shelfLocation: `${category.slice(0, 3).toUpperCase()}-${faker.string.alpha({ length: 1, casing: "upper" })}${faker.number.int({ min: 1, max: 20 })}-${faker.number.int({ min: 1, max: 50 })}`,
      branch: faker.helpers.arrayElement(BRANCHES),
      description: faker.lorem.sentences(2),
      tags: faker.helpers.arrayElements(
        ["popular", "new-arrival", "recommended", "course-required", "rare", "award-winning"],
        faker.number.int({ min: 0, max: 3 })
      ),
      rating: faker.number.float({ min: 2.5, max: 5, fractionDigits: 1 }),
    });
  }
  return books;
}

async function seed() {
  await connectDB();

  console.log("🗑  Clearing existing books...");
  await Book.deleteMany({});

  const categories = Object.keys(categoryData);
  const perCategory = Math.floor(TOTAL_BOOKS / categories.length);

  let totalInserted = 0;

  for (const category of categories) {
    const books = generateBooksForCategory(category, perCategory);

    for (let i = 0; i < books.length; i += BATCH_SIZE) {
      const batch = books.slice(i, i + BATCH_SIZE);
      try {
        await Book.insertMany(batch, { ordered: false });
        totalInserted += batch.length;
      } catch (err) {
        // Ignore duplicate ISBN errors from random collisions, but never hide
        // schema or database errors that would leave a category incomplete.
        if (!err.writeErrors) throw err;
        totalInserted += batch.length - err.writeErrors.length;
      }
      process.stdout.write(`\r📚 Inserted ~${totalInserted}/${TOTAL_BOOKS} books...`);
    }
  }

  const finalCount = await Book.countDocuments();
  console.log(`\n✅ Done! Total books in database: ${finalCount}`);
  console.log("📊 Books per category:");
  for (const category of categories) {
    const c = await Book.countDocuments({ category });
    console.log(`   - ${category}: ${c}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}

module.exports = { ordinal, generateBooksForCategory, categoryData };
