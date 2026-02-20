class FeedbacksController < ApplicationController
  def new
    @feedback = Feedback.new
  end

  def create
    @feedback = current_user.feedbacks.new(feedback_params)
    if @feedback.save
      raw_count = ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM feedbacks").to_i
      found = ActiveRecord::Base.connection.select_one("SELECT id, user_id, category FROM feedbacks WHERE id = #{@feedback.id}")
      Rails.logger.info "[FEEDBACK] 저장 성공: id=#{@feedback.id}, persisted=#{@feedback.persisted?}, raw_count=#{raw_count}, found=#{found.inspect}"
      redirect_to clubs_path, notice: I18n.t("feedback.notice.saved", default: "피드백이 전송되었습니다. 감사합니다!")
    else
      Rails.logger.info "[FEEDBACK] 저장 실패: #{@feedback.errors.full_messages.join(', ')}"
      render :new, status: :unprocessable_entity
    end
  end

  private

  def feedback_params
    params.require(:feedback).permit(:content, :category)
  end
end
