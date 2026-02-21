class RenamePossessionSwitchPatternsToFibaNba < ActiveRecord::Migration[8.1]
  def up
    # 기존 패턴을 FIBA로 통합 변환
    execute <<~SQL
      UPDATE users SET possession_switch_pattern = 'fiba' WHERE possession_switch_pattern IN ('q12_q34', 'q13_q24')
    SQL

    change_column_default :users, :possession_switch_pattern, from: "q12_q34", to: "fiba"
  end

  def down
    execute <<~SQL
      UPDATE users SET possession_switch_pattern = 'q12_q34' WHERE possession_switch_pattern = 'fiba'
    SQL
    execute <<~SQL
      UPDATE users SET possession_switch_pattern = 'q13_q24' WHERE possession_switch_pattern = 'nba'
    SQL

    change_column_default :users, :possession_switch_pattern, from: "fiba", to: "q12_q34"
  end
end
