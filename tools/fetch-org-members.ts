#!/usr/bin/env bun

/**
 * Qiita組織のメンバーIDを取得する簡易ツール
 * 
 * 使用方法:
 *   bun run tools/fetch-org-members.ts <organization-name>
 * 
 * 例:
 *   bun run tools/fetch-org-members.ts wakuto-inc
 * 
 * 注意: このツールは非公式な方法（WebページのJSONデータを抽出）を使用しています。
 *       Qiitaのページ構造が変更されると動作しなくなる可能性があります。
 */

interface OrganizationData {
  organization: {
    memberships: {
      edges: Array<{
        node: {
          user: {
            urlName: string;
            name?: string;
          };
        };
      }>;
    };
  };
}

async function fetchOrgMembers(orgName: string): Promise<string[]> {
  const url = `https://qiita.com/organizations/${orgName}/members`;
  
  console.log(`Fetching members from: ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    
    // JSONデータを抽出（ページに埋め込まれたJSONを探す）
    // パターン1: <script>タグ内のJSONデータを探す
    // パターン2: {"organization":{"paginatedMemberships... から </script> まで
    let jsonStr: string | null = null;
    
    // まず、scriptタグ内のJSONを探す
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
    if (scriptMatches) {
      for (const script of scriptMatches) {
        const orgMatch = script.match(/\{"organization":\{"paginatedMemberships[^<]*/);
        if (orgMatch) {
          jsonStr = orgMatch[0];
          break;
        }
      }
    }
    
    // パターン1で見つからない場合、直接検索
    if (!jsonStr) {
      const directMatch = html.match(/\{"organization":\{"paginatedMemberships[^<]*/);
      if (directMatch) {
        jsonStr = directMatch[0];
      }
    }
    
    if (!jsonStr) {
      throw new Error('Could not find organization data in the page. The page structure may have changed.');
    }
    
    // JSONを完全な形式に補完（末尾の閉じ括弧を追加）
    // 不完全なJSONを補完する試み
    const openBraces = (jsonStr.match(/\{/g) || []).length;
    const closeBraces = (jsonStr.match(/\}/g) || []).length;
    const needed = openBraces - closeBraces;
    if (needed > 0) {
      jsonStr += '}'.repeat(needed);
    }
    
    // JSONをパース
    let data: OrganizationData;
    try {
      data = JSON.parse(jsonStr) as OrganizationData;
    } catch (parseError) {
      throw new Error(`Failed to parse JSON data: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    
    // メンバーIDを抽出
    const memberIds = data.organization.memberships.edges.map(
      (edge) => edge.node.user.urlName
    );
    
    return memberIds;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch organization members: ${error.message}`);
    }
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Error: Organization name is required');
    console.error('');
    console.error('Usage: bun run tools/fetch-org-members.ts <organization-name>');
    console.error('');
    console.error('Example:');
    console.error('  bun run tools/fetch-org-members.ts wakuto-inc');
    process.exit(1);
  }
  
  const orgName = args[0];
  
  try {
    const memberIds = await fetchOrgMembers(orgName);
    
    if (memberIds.length === 0) {
      console.warn('Warning: No members found for this organization.');
      process.exit(0);
    }
    
    // カンマ区切りで出力（ORG_MEMBERSにそのまま使える形式）
    console.log('');
    console.log('Organization members (comma-separated):');
    console.log(memberIds.join(','));
    console.log('');
    console.log('Individual members:');
    memberIds.forEach((id, index) => {
      console.log(`  ${index + 1}. ${id}`);
    });
    console.log('');
    console.log(`Total: ${memberIds.length} members`);
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.error('');
    console.error('Note: This tool uses an unofficial method to extract member data.');
    console.error('      If it fails, Qiita\'s page structure may have changed.');
    process.exit(1);
  }
}

main();

