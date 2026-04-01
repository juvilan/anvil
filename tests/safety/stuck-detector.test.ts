import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  recordError,
  loadErrors,
  isStuck,
  type ErrorEntry,
} from "../../src/safety/stuck-detector.js";

const TEST_DIR = resolve(import.meta.dirname, ".tmp-stuck-test");

function makeEntry(taskId: string, error: string): ErrorEntry {
  return { taskId, error, timestamp: new Date().toISOString() };
}

describe("stuck-detector", () => {
  beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

  describe("recordError", () => {
    it("errors.log에 JSON 라인을 추가한다", () => {
      const entry = makeEntry("T01", "build failed");
      recordError(TEST_DIR, entry);

      const errors = loadErrors(TEST_DIR);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.taskId).toBe("T01");
      expect(errors[0]?.error).toBe("build failed");
    });

    it("여러 번 호출하면 누적된다", () => {
      recordError(TEST_DIR, makeEntry("T01", "err1"));
      recordError(TEST_DIR, makeEntry("T02", "err2"));

      const errors = loadErrors(TEST_DIR);
      expect(errors).toHaveLength(2);
    });
  });

  describe("loadErrors", () => {
    it("파일이 없으면 빈 배열을 반환한다", () => {
      expect(loadErrors(TEST_DIR)).toEqual([]);
    });

    it("깨진 JSON 라인이 있으면 빈 배열을 반환한다", () => {
      writeFileSync(resolve(TEST_DIR, "errors.log"), "not-json\n");
      expect(loadErrors(TEST_DIR)).toEqual([]);
    });
  });

  describe("isStuck", () => {
    it("에러가 없으면 false를 반환한다", () => {
      expect(isStuck(TEST_DIR)).toBe(false);
    });

    it("에러가 threshold 미만이면 false를 반환한다", () => {
      recordError(TEST_DIR, makeEntry("T01", "same error"));
      recordError(TEST_DIR, makeEntry("T01", "same error"));
      // threshold=3이지만 2개만 있음
      expect(isStuck(TEST_DIR, 3)).toBe(false);
    });

    it("규칙 1: 동일 에러 3회 연속이면 true를 반환한다", () => {
      recordError(TEST_DIR, makeEntry("T01", "same error"));
      recordError(TEST_DIR, makeEntry("T01", "same error"));
      recordError(TEST_DIR, makeEntry("T01", "same error"));
      expect(isStuck(TEST_DIR)).toBe(true);
    });

    it("규칙 1: 에러가 달라도 정규화 후 같으면 true를 반환한다 (대소문자, 공백)", () => {
      recordError(TEST_DIR, makeEntry("T01", "  BUILD FAILED  "));
      recordError(TEST_DIR, makeEntry("T01", "build failed"));
      recordError(TEST_DIR, makeEntry("T01", "Build Failed"));
      expect(isStuck(TEST_DIR)).toBe(true);
    });

    it("규칙 2: A-B-A-B 진동 패턴이면 true를 반환한다", () => {
      recordError(TEST_DIR, makeEntry("T01", "error A"));
      recordError(TEST_DIR, makeEntry("T01", "error B"));
      recordError(TEST_DIR, makeEntry("T01", "error A"));
      recordError(TEST_DIR, makeEntry("T01", "error B"));
      expect(isStuck(TEST_DIR)).toBe(true);
    });

    it("규칙 2: A-B-A-C 패턴은 진동이 아니다 (false)", () => {
      recordError(TEST_DIR, makeEntry("T01", "error A"));
      recordError(TEST_DIR, makeEntry("T01", "error B"));
      recordError(TEST_DIR, makeEntry("T01", "error A"));
      recordError(TEST_DIR, makeEntry("T01", "error C"));
      expect(isStuck(TEST_DIR)).toBe(false);
    });

    it("규칙 3: 동일 태스크에서 5회 에러 (메시지 달라도) true를 반환한다", () => {
      for (let i = 0; i < 5; i++) {
        recordError(TEST_DIR, makeEntry("T01", `different error ${i}`));
      }
      expect(isStuck(TEST_DIR)).toBe(true);
    });

    it("커스텀 threshold 파라미터가 동작한다", () => {
      recordError(TEST_DIR, makeEntry("T01", "same"));
      recordError(TEST_DIR, makeEntry("T01", "same"));
      expect(isStuck(TEST_DIR, 2)).toBe(true);
      expect(isStuck(TEST_DIR, 3)).toBe(false);
    });
  });
});
