class FeedbacksController < ApplicationController
  def new
    @feedback = Feedback.new
  end

  def create
    @feedback = current_user.feedbacks.new(feedback_params)
    if @feedback.save
      redirect_to clubs_path, notice: I18n.t("feedback.notice.saved", default: "피드백이 전송되었습니다. 감사합니다!")
    else
      render :new, status: :unprocessable_entity
    end
  end

  private

  def feedback_params
    params.require(:feedback).permit(:content, :category)
  end
end
