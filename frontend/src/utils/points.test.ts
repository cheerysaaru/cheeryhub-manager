import { describe, it, expect } from 'vitest';
import { levelFor, pointsIntoLevel, pointsToNextLevel } from './points';

describe('levelFor', () => {
  it('starts every new user at level 1', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(1)).toBe(1);
    expect(levelFor(99)).toBe(1);
  });

  it('levels up every 100 points', () => {
    expect(levelFor(100)).toBe(2);
    expect(levelFor(199)).toBe(2);
    expect(levelFor(1000)).toBe(11);
  });

  it('never drops below level 1 for negative points', () => {
    expect(levelFor(-1)).toBe(1);
    expect(levelFor(-9999)).toBe(1);
  });
});

describe('pointsIntoLevel', () => {
  it('reports progress inside the current level', () => {
    expect(pointsIntoLevel(0)).toBe(0);
    expect(pointsIntoLevel(42)).toBe(42);
    expect(pointsIntoLevel(100)).toBe(0);
    expect(pointsIntoLevel(142)).toBe(42);
  });

  it('wraps negative points into 0-99', () => {
    expect(pointsIntoLevel(-1)).toBe(99);
    expect(pointsIntoLevel(-25)).toBe(75);
  });
});

describe('pointsToNextLevel', () => {
  it('is the distance to the next level', () => {
    expect(pointsToNextLevel(0)).toBe(100);
    expect(pointsToNextLevel(75)).toBe(25);
    expect(pointsToNextLevel(100)).toBe(100);
    expect(pointsToNextLevel(-1)).toBe(1);
  });
});
