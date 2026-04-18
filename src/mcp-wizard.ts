/**
 * AI_Svetlio - MCP Wizard
 *
 * Интерактивен помощник за избор и създаване на MCP сървъри
 */

import chalk from 'chalk';
import inquirer from 'inquirer';

export class MCPWizard {
  
  async run(): Promise<void> {
    console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════════╗
║  🏭 MCP Server Creator Wizard                                  ║
║  Ще ти помогна да избереш правилния инструмент               ║
╚═══════════════════════════════════════════════════════════════╝
    `));
    
    console.log(chalk.yellow('Ще ти задам няколко въпроса, за да намерим най-подходящия инструмент.\n'));
    
    // Въпрос 1: Имаш ли OpenAPI spec?
    const { hasOpenAPI } = await inquirer.prompt([{
      type: 'confirm',
      name: 'hasOpenAPI',
      message: 'Имаш ли вече REST API с OpenAPI/Swagger documentation?',
      default: false
    }]);
    
    if (hasOpenAPI) {
      const { wantAutoConvert } = await inquirer.prompt([{
        type: 'confirm',
        name: 'wantAutoConvert',
        message: 'Искаш ли автоматично да конвертираш OpenAPI spec в MCP сървър?',
        default: true
      }]);
      
      if (wantAutoConvert) {
        await this.showOpenAPIWarnings();
        
        const { proceedWithOpenAPI } = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceedWithOpenAPI',
          message: 'Разбираш ли рисковете и искаш ли да продължиш с openapi-to-mcpserver?',
          default: false
        }]);
        
        if (proceedWithOpenAPI) {
          return this.recommendTool('openapi-to-mcpserver');
        }
      }
    }
    
    // Въпрос 2: Какъв език предпочиташ?
    const { preferredLanguage } = await inquirer.prompt([{
      type: 'list',
      name: 'preferredLanguage',
      message: 'Какъв програмен език предпочиташ?',
      choices: [
        { name: '🐍 Python (препоръчително за MCP)', value: 'python' },
        { name: '📦 Node.js / TypeScript', value: 'nodejs' },
        { name: '❓ Нямам предпочитание', value: 'any' }
      ]
    }]);
    
    // Въпрос 3: Какво ниво на контрол?
    const { controlLevel } = await inquirer.prompt([{
      type: 'list',
      name: 'controlLevel',
      message: 'Какво ниво на контрол искаш над кода?',
      choices: [
        { name: '🎯 Пълен контрол - искам да пиша цялата логика сам', value: 'full' },
        { name: '⚡ Бърз старт - дай ми scaffold, аз ще добавя логиката', value: 'scaffold' }
      ]
    }]);
    
    // Вземи решение
    let recommendation: string;
    
    if (preferredLanguage === 'python' || preferredLanguage === 'any') {
      recommendation = 'fastmcp';
      console.log(chalk.green('\n✓ Препоръчвам FastMCP - най-добрият избор за повечето случаи.\n'));
    } else {
      recommendation = 'generator-mcp';
      console.log(chalk.green('\n✓ Препоръчвам generator-mcp - добър избор за Node.js developers.\n'));
    }
    
    return this.recommendTool(recommendation);
  }
  
  private async showOpenAPIWarnings(): Promise<void> {
    console.log(chalk.red(`
╔═══════════════════════════════════════════════════════════════╗
║  ⚠️  ВАЖНИ ПРЕДУПРЕЖДЕНИЯ за openapi-to-mcpserver            ║
╚═══════════════════════════════════════════════════════════════╝
    `));
    
    console.log(chalk.yellow(`
1. ВСИЧКИ endpoints от OpenAPI spec-а стават MCP tools
   → Ако имаш DELETE /users/{id}, Claude ще може да трие потребители!
   → Прегледай spec-а и премахни sensitive endpoints ПРЕДИ генериране

2. Authentication е ТВОЯ отговорност
   → Трябва да конфигурираш API keys/tokens правилно
   → Никога не deploy-вай без auth за production APIs

3. Генерираният код ТРЯБВА да се прегледа
   → Не го deploy-вай "на сляпо"
   → Провери какви tools са създадени
   → Тествай с MCP Inspector преди production

4. Не всичко се поддържа
   → File uploads може да не работят
   → WebSockets не се поддържат
   → Complex schemas може да имат проблеми
    `));
  }
  
  private async recommendTool(toolId: string): Promise<void> {
    const tools: Record<string, any> = {
      'fastmcp': {
        name: 'FastMCP',
        description: 'Python framework за създаване на MCP сървъри с пълен контрол',
        install: 'pip install fastmcp',
        docs: 'https://gofastmcp.com/',
        github: 'https://github.com/jlowin/fastmcp',
        trustLevel: '🟢 Висока',
        productionReady: true,
        example: `from fastmcp import FastMCP

mcp = FastMCP("Моят сървър")

@mcp.tool()
def get_weather(city: str) -> dict:
    """Взима времето за даден град"""
    return {"city": city, "temp": 22}

if __name__ == "__main__":
    mcp.run()`,
        bestFor: [
          'Production-ready MCP сървъри',
          'Custom business логика',
          'Пълен контрол над кода',
          'Python developers'
        ],
        notFor: [
          'Ако не познаваш Python',
          'Ако искаш само да expose-неш съществуващ API'
        ]
      },
      
      'generator-mcp': {
        name: 'generator-mcp (Yeoman)',
        description: 'Yeoman generator за Node.js MCP сървъри с VS Code debugging',
        install: 'npm install -g yo generator-mcp && yo mcp',
        github: 'https://github.com/formulahendry/generator-mcp',
        trustLevel: '🟢 Висока',
        productionReady: true,
        example: `# Инсталация
npm install -g yo generator-mcp

# Създаване на нов проект
mkdir my-mcp-server && cd my-mcp-server
yo mcp

# Отвори във VS Code, натисни F5 за debugging`,
        bestFor: [
          'Node.js/TypeScript developers',
          'Бърз старт с готова структура',
          'VS Code debugging'
        ],
        notFor: [
          'Ако предпочиташ Python',
          'Ако искаш автоматично от API spec'
        ]
      },
      
      'openapi-to-mcpserver': {
        name: 'openapi-to-mcpserver',
        description: 'Конвертира OpenAPI spec в MCP сървър автоматично',
        install: 'npm install -g openapi-to-mcpserver',
        github: 'https://github.com/anthropics/openapi-to-mcpserver',
        trustLevel: '🟡 Средна (изисква внимание)',
        productionReady: true,
        example: `# Инсталация
npm install -g openapi-to-mcpserver

# Генериране
openapi-to-mcpserver generate \\
  --input ./openapi.yaml \\
  --output ./mcp-server \\
  --name "my-api-mcp"

# ⚠️ ПРЕГЛЕДАЙ генерирания код преди deploy!`,
        bestFor: [
          'Съществуващи REST APIs с OpenAPI documentation',
          'Много endpoints (автоматизация)'
        ],
        notFor: [
          'Ако нямаш OpenAPI spec',
          'Ако искаш custom логика',
          'Ако API-то има sensitive endpoints'
        ],
        warnings: [
          '⚠️ ВСИЧКИ endpoints стават MCP tools - внимавай!',
          '⚠️ Прегледай генерирания код преди deploy',
          '⚠️ Конфигурирай authentication правилно'
        ]
      }
    };
    
    const tool = tools[toolId];
    
    console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════════╗
║  🏭 ${tool.name.padEnd(52)}║
╚═══════════════════════════════════════════════════════════════╝
    `));
    
    console.log(chalk.white(tool.description));
    console.log();
    
    console.log(chalk.yellow('📊 Информация:'));
    console.log(`   Ниво на доверие: ${tool.trustLevel}`);
    console.log(`   Production-ready: ${tool.productionReady ? '✅ Да' : '❌ Не'}`);
    console.log();
    
    console.log(chalk.green('✅ Подходящ за:'));
    tool.bestFor.forEach((item: string) => console.log(`   • ${item}`));
    console.log();
    
    console.log(chalk.red('❌ НЕ е подходящ за:'));
    tool.notFor.forEach((item: string) => console.log(`   • ${item}`));
    console.log();
    
    if (tool.warnings) {
      console.log(chalk.yellow('⚠️ Предупреждения:'));
      tool.warnings.forEach((w: string) => console.log(`   ${w}`));
      console.log();
    }
    
    console.log(chalk.cyan('📦 Инсталация:'));
    console.log(chalk.white(`   ${tool.install}`));
    console.log();
    
    console.log(chalk.cyan('📝 Пример:'));
    console.log(chalk.gray(tool.example.split('\n').map((l: string) => `   ${l}`).join('\n')));
    console.log();
    
    console.log(chalk.dim(`GitHub: ${tool.github}`));
    if (tool.docs) {
      console.log(chalk.dim(`Docs: ${tool.docs}`));
    }
    
    // Финален въпрос
    const { wantInstall } = await inquirer.prompt([{
      type: 'confirm',
      name: 'wantInstall',
      message: `Искаш ли инструкции за инсталация на ${tool.name}?`,
      default: true
    }]);
    
    if (wantInstall) {
      console.log(chalk.yellow(`\n📋 Изпълни следната команда:\n`));
      console.log(chalk.white.bold(`   ${tool.install}\n`));
      
      if (toolId === 'fastmcp') {
        console.log(chalk.dim('След инсталация, виж примери на: https://gofastmcp.com/'));
      } else if (toolId === 'generator-mcp') {
        console.log(chalk.dim('След `yo mcp`, отвори проекта във VS Code и натисни F5'));
      } else if (toolId === 'openapi-to-mcpserver') {
        console.log(chalk.yellow('\n⚠️ НАПОМНЯНЕ: Прегледай генерирания код преди deploy!'));
      }
    }
    
    console.log();
  }
}
