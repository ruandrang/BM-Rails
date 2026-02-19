# 경기 관련 concern들이 공유하는 헬퍼 메서드
# MatchScoring, MatchGames 등에서 사용하는 공통 로직을 모아둔다.
module MatchHelpers
  extend ActiveSupport::Concern

  private

  def game_started?(game)
    return true if game.result != "pending"
    return true if game.home_score.to_i > 0 || game.away_score.to_i > 0

    quarter_scores = game.quarter_scores
    return false if quarter_scores.blank?

    quarter_scores.values.any? do |score|
      score.is_a?(Hash) && (score["home"].to_i > 0 || score["away"].to_i > 0)
    end
  end

  def extract_scores_from_params
    return nil unless params[:scores].respond_to?(:each)

    max_regular_quarters = @match.regular_quarters_count
    scores = {}
    params[:scores].each do |game_id, score_data|
      next unless game_id.to_s.match?(/\A\d+\z/)

      sanitized = {}
      quarters = score_data[:quarters] || score_data["quarters"]
      if quarters.respond_to?(:each)
        sanitized_quarters = {}
        quarters.each do |q_num, q_data|
          next unless q_num.to_s.match?(/\A\d+\z/)
          quarter_number = q_num.to_i
          next unless quarter_number.between?(1, max_regular_quarters)

          sanitized_quarters[quarter_number.to_s] = {
            "home" => q_data[:home].to_i,
            "away" => q_data[:away].to_i
          }
        end
        sanitized["quarters"] = sanitized_quarters
      end
      scores[game_id] = sanitized
    end
    scores.presence
  end
end
