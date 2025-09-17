/**
 * Test Runner and Coverage Reporter
 *
 * Comprehensive test runner script that executes all test suites,
 * generates coverage reports, and provides detailed test results.
 *
 * @author StakeOut Development Team
 * @since 1.0.0
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class TestRunner {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '../..');
    this.results = {
      suites: [],
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      coverage: null,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Run all test suites
   *
   * @async
   * @returns {Promise<Object>} Test results
   */
  async runAllTests() {
    console.log('🚀 Starting Payment Module Test Suite');
    console.log('=====================================\n');

    this.results.startTime = Date.now();

    try {
      // Run different test categories
      await this.runUnitTests();
      await this.runIntegrationTests();
      await this.generateCoverageReport();

      this.results.endTime = Date.now();
      this.displaySummary();

      return this.results;

    } catch (error) {
      console.error('❌ Test runner failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Run unit tests
   *
   * @async
   * @private
   */
  async runUnitTests() {
    console.log('📋 Running Unit Tests...');
    console.log('------------------------\n');

    const unitTestPaths = [
      '__tests__/events/PaymentEventEmitter.test.js',
      '__tests__/database/models/Transaction.test.js',
      '__tests__/providers/mpesa/MpesaProvider.test.js'
    ];

    for (const testPath of unitTestPaths) {
      await this.runTestSuite(testPath, 'unit');
    }
  }

  /**
   * Run integration tests
   *
   * @async
   * @private
   */
  async runIntegrationTests() {
    console.log('\n🔗 Running Integration Tests...');
    console.log('-------------------------------\n');

    const integrationTestPaths = [
      '__tests__/api/routes/payments.test.js',
      '__tests__/api/routes/health.test.js'
    ];

    for (const testPath of integrationTestPaths) {
      await this.runTestSuite(testPath, 'integration');
    }
  }

  /**
   * Run a specific test suite
   *
   * @async
   * @param {string} testPath - Path to test file
   * @param {string} category - Test category (unit/integration)
   * @private
   */
  async runTestSuite(testPath, category) {
    const testName = path.basename(testPath, '.test.js');
    console.log(`  🧪 ${testName}...`);

    try {
      const result = await this.executeJest(testPath);

      const suiteResult = {
        name: testName,
        category,
        path: testPath,
        passed: result.success,
        tests: result.numTotalTests,
        failures: result.numFailedTests,
        duration: result.duration
      };

      this.results.suites.push(suiteResult);
      this.results.totalTests += result.numTotalTests;
      this.results.passedTests += result.numPassedTests;
      this.results.failedTests += result.numFailedTests;

      if (result.success) {
        console.log(`     ✅ ${testName} - ${result.numTotalTests} tests passed`);
      } else {
        console.log(`     ❌ ${testName} - ${result.numFailedTests}/${result.numTotalTests} tests failed`);
      }

    } catch (error) {
      console.log(`     💥 ${testName} - Suite failed to run: ${error.message}`);

      this.results.suites.push({
        name: testName,
        category,
        path: testPath,
        passed: false,
        error: error.message
      });
    }
  }

  /**
   * Execute Jest for a specific test file
   *
   * @async
   * @param {string} testPath - Path to test file
   * @returns {Promise<Object>} Jest execution result
   * @private
   */
  async executeJest(testPath) {
    return new Promise((resolve, reject) => {
      const jestArgs = [
        '--testPathPattern', testPath,
        '--verbose',
        '--no-cache',
        '--forceExit',
        '--detectOpenHandles'
      ];

      const jest = spawn('npx', ['jest', ...jestArgs], {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      jest.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      jest.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      jest.on('close', (code) => {
        try {
          // Parse Jest output for results
          const result = this.parseJestOutput(stdout, stderr, code);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      jest.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse Jest output for test results
   *
   * @param {string} stdout - Jest stdout
   * @param {string} stderr - Jest stderr
   * @param {number} exitCode - Jest exit code
   * @returns {Object} Parsed test results
   * @private
   */
  parseJestOutput(stdout, stderr, exitCode) {
    const output = stdout + stderr;

    // Extract test counts from Jest output
    const testsMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/) ||
                      output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/) ||
                      output.match(/(\d+)\s+tests?\s+passed/);

    let numFailedTests = 0;
    let numPassedTests = 0;
    let numTotalTests = 0;

    if (testsMatch) {
      if (testsMatch.length === 4) {
        // "X failed, Y passed, Z total" format
        numFailedTests = parseInt(testsMatch[1]);
        numPassedTests = parseInt(testsMatch[2]);
        numTotalTests = parseInt(testsMatch[3]);
      } else if (testsMatch.length === 3) {
        // "X passed, Y total" format
        numPassedTests = parseInt(testsMatch[1]);
        numTotalTests = parseInt(testsMatch[2]);
        numFailedTests = numTotalTests - numPassedTests;
      } else {
        // "X tests passed" format
        numPassedTests = parseInt(testsMatch[1]);
        numTotalTests = numPassedTests;
      }
    }

    // Extract duration
    const durationMatch = output.match(/Time:\s+([\d.]+)\s*s/);
    const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;

    return {
      success: exitCode === 0,
      numTotalTests,
      numPassedTests,
      numFailedTests,
      duration,
      output
    };
  }

  /**
   * Generate coverage report
   *
   * @async
   * @private
   */
  async generateCoverageReport() {
    console.log('\n📊 Generating Coverage Report...');
    console.log('--------------------------------\n');

    try {
      const coverageResult = await this.executeCoverage();
      this.results.coverage = coverageResult;

      console.log('  ✅ Coverage report generated');
      console.log(`     📁 HTML report: coverage/lcov-report/index.html`);
      console.log(`     📄 LCOV report: coverage/lcov.info`);

    } catch (error) {
      console.log(`  ⚠️  Coverage generation failed: ${error.message}`);
    }
  }

  /**
   * Execute Jest with coverage
   *
   * @async
   * @returns {Promise<Object>} Coverage results
   * @private
   */
  async executeCoverage() {
    return new Promise((resolve, reject) => {
      const jestArgs = [
        '--coverage',
        '--coverageReporters', 'text', 'lcov', 'html',
        '--forceExit',
        '--silent'
      ];

      const jest = spawn('npx', ['jest', ...jestArgs], {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      jest.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      jest.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      jest.on('close', (code) => {
        try {
          const coverage = this.parseCoverageOutput(stdout + stderr);
          resolve(coverage);
        } catch (error) {
          reject(error);
        }
      });

      jest.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse coverage output
   *
   * @param {string} output - Jest coverage output
   * @returns {Object} Parsed coverage data
   * @private
   */
  parseCoverageOutput(output) {
    // Extract coverage percentages from Jest output
    const coverageMatch = output.match(/All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/);

    if (coverageMatch) {
      return {
        statements: parseFloat(coverageMatch[1]),
        branches: parseFloat(coverageMatch[2]),
        functions: parseFloat(coverageMatch[3]),
        lines: parseFloat(coverageMatch[4])
      };
    }

    return {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0
    };
  }

  /**
   * Display test summary
   *
   * @private
   */
  displaySummary() {
    const duration = (this.results.endTime - this.results.startTime) / 1000;

    console.log('\n🎯 Test Summary');
    console.log('===============\n');

    console.log(`⏱️  Total Duration: ${duration.toFixed(2)}s`);
    console.log(`📊 Total Tests: ${this.results.totalTests}`);
    console.log(`✅ Passed: ${this.results.passedTests}`);
    console.log(`❌ Failed: ${this.results.failedTests}`);
    console.log(`⏭️  Skipped: ${this.results.skippedTests}`);

    if (this.results.coverage) {
      console.log('\n📈 Coverage:');
      console.log(`   Statements: ${this.results.coverage.statements}%`);
      console.log(`   Branches: ${this.results.coverage.branches}%`);
      console.log(`   Functions: ${this.results.coverage.functions}%`);
      console.log(`   Lines: ${this.results.coverage.lines}%`);
    }

    console.log('\n📋 Test Suites:');
    this.results.suites.forEach(suite => {
      const status = suite.passed ? '✅' : '❌';
      const category = suite.category.padEnd(12);
      console.log(`   ${status} [${category}] ${suite.name}`);
    });

    const successRate = ((this.results.passedTests / this.results.totalTests) * 100).toFixed(1);

    if (this.results.failedTests === 0) {
      console.log(`\n🎉 All tests passed! (${successRate}% success rate)`);
    } else {
      console.log(`\n⚠️  ${this.results.failedTests} test(s) failed (${successRate}% success rate)`);
    }
  }

  /**
   * Generate test report file
   *
   * @async
   * @returns {Promise<void>}
   */
  async generateReport() {
    const reportPath = path.join(this.projectRoot, 'test-report.json');

    const report = {
      ...this.results,
      generatedAt: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd()
      }
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Test report saved: ${reportPath}`);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const runner = new TestRunner();

  runner.runAllTests()
    .then(async (results) => {
      await runner.generateReport();

      // Exit with error code if tests failed
      process.exit(results.failedTests > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('❌ Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = TestRunner;