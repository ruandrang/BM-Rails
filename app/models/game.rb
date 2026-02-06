class Game < ApplicationRecord
  RESULTS = %w[pending home_win away_win draw].freeze

  belongs_to :match
  belongs_to :home_team, class_name: "Team"
  belongs_to :away_team, class_name: "Team"

  validates :result, inclusion: { in: RESULTS }

  # 점수를 기반으로 결과를 자동으로 결정
  def update_result_from_scores
    if home_score > away_score
      self.result = "home_win"
    elsif away_score > home_score
      self.result = "away_win"
    elsif home_score == away_score && (home_score > 0 || away_score > 0)
      self.result = "draw"
    else
      # 0:0인 경우 pending 유지
      self.result = "pending"
    end
  end

  # 점수를 업데이트하고 결과도 자동으로 결정
  def update_scores(home_score_value, away_score_value)
    self.home_score = home_score_value
    self.away_score = away_score_value
    update_result_from_scores
    save
  end
end
